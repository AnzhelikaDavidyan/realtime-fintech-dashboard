import { MARKET_UPDATE_STRIDE } from '../core/market-update';
import { decodeMetrics } from '../core/metrics-codec';
import { WorkerEvent } from '../core/worker-protocol';
import {
  BatchGenerator,
  MAX_TICK_GAP_MS,
  ProducerEngine,
  Scheduler,
  TICK_MS,
} from './producer-engine';

/** Manual clock and scheduler: time only moves when the test calls `advance`. */
class FakeTime implements Scheduler {
  now = 1_000;
  private timers = new Map<number, { interval: number; next: number; callback: () => void }>();
  private nextId = 0;

  readonly clock = () => this.now;

  every(interval: number, callback: () => void): () => void {
    const id = this.nextId++;
    this.timers.set(id, { interval, next: this.now + interval, callback });
    return () => this.timers.delete(id);
  }

  get activeTimers(): number {
    return this.timers.size;
  }

  /** Moves time forward, firing due timers in order. */
  advance(ms: number): void {
    const end = this.now + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, t]) => t.next <= end)
        .sort(([, a], [, b]) => a.next - b.next)[0];
      if (!due) break;
      const [, timer] = due;
      this.now = timer.next;
      timer.next += timer.interval;
      timer.callback();
    }
    this.now = end;
  }

  /**
   * Jumps the clock without firing timers, like a frozen background tab.
   * Missed ticks are dropped, as browsers do, not replayed afterwards.
   */
  jump(ms: number): void {
    this.now += ms;
    for (const timer of this.timers.values()) {
      timer.next = this.now + timer.interval;
    }
  }
}

/** Generator stub: valid updates spread over instruments, trade quantity 1. */
class FakeGenerator implements BatchGenerator {
  readonly requested: number[] = [];
  constructor(private readonly instruments: number) {}

  generateBatch(n: number): Int32Array {
    this.requested.push(n);
    const out = new Int32Array(n * MARKET_UPDATE_STRIDE);
    for (let i = 0; i < n; i++) {
      out.set([i % this.instruments, 100, 101, 10, 10, 101, 1], i * MARKET_UPDATE_STRIDE);
    }
    return out;
  }
}

function setup() {
  const time = new FakeTime();
  const events: WorkerEvent[] = [];
  const generators: { seed: number; instruments: number; generator: FakeGenerator }[] = [];
  const engine = new ProducerEngine({
    createGenerator: (seed, instruments) => {
      const generator = new FakeGenerator(instruments);
      generators.push({ seed, instruments, generator });
      return generator;
    },
    scheduler: time,
    clock: time.clock,
    emit: (e) => events.push(e),
  });
  const snapshots = () => events.filter((e) => e.type === 'snapshot');
  const statuses = () => events.filter((e) => e.type === 'status').map((e) => e.status);
  return { time, events, generators, engine, snapshots, statuses };
}

const settings = { seed: 7, instruments: 3, updatesPerSecond: 1_000, snapshotIntervalMs: 100 };

describe('ProducerEngine', () => {
  it('starts idle with nothing scheduled', () => {
    const { engine, time } = setup();
    expect(engine.status).toBe('idle');
    expect(time.activeTimers).toBe(0);
  });

  describe('start', () => {
    it('creates a generator from the settings and reports running', () => {
      const { engine, generators, statuses, time } = setup();
      engine.start(1, settings);
      expect(generators).toHaveLength(1);
      expect(generators[0]).toMatchObject({ seed: 7, instruments: 3 });
      expect(engine.status).toBe('running');
      expect(statuses()).toEqual(['running']);
      expect(time.activeTimers).toBe(1);
    });

    it('generates updates at the requested rate', () => {
      const { engine, time } = setup();
      engine.start(1, settings);
      time.advance(1_000);
      expect(engine.totalUpdates).toBe(1_000);
    });

    it('keeps low rates accurate by carrying fractions between ticks', () => {
      const { engine, time } = setup();
      engine.start(1, { ...settings, updatesPerSecond: 3 });
      time.advance(10_000);
      expect(engine.totalUpdates).toBe(30);
    });

    it('normalizes settings before using them', () => {
      const { engine, generators } = setup();
      engine.start(1, { instruments: 0 });
      expect(generators[0].instruments).toBe(1);
    });

    it('resets state when a new run starts', () => {
      const { engine, time, snapshots, generators } = setup();
      engine.start(1, settings);
      time.advance(500);
      engine.start(2, { ...settings, seed: 99 });

      expect(engine.totalUpdates).toBe(0);
      expect(time.activeTimers).toBe(1);
      expect(generators[1].seed).toBe(99);

      const before = snapshots().length;
      time.advance(200);
      const fresh = snapshots().slice(before);
      expect(fresh.length).toBeGreaterThan(0);
      expect(fresh.every((s) => s.runId === 2)).toBe(true);
      expect(fresh.at(-1)!.totalUpdates).toBe(200);
      // The first run's generator is no longer used.
      expect(generators[0].generator.requested).toHaveLength(10);
    });
  });

  describe('snapshots', () => {
    it('are throttled to about 10 per second', () => {
      const { engine, time, snapshots } = setup();
      engine.start(1, settings);
      time.advance(1_000);
      expect(snapshots()).toHaveLength(10);
    });

    it('follow a slower interval from the settings', () => {
      const { engine, time, snapshots } = setup();
      engine.start(1, { ...settings, snapshotIntervalMs: 500 });
      time.advance(1_000);
      expect(snapshots()).toHaveLength(2);
    });

    it('never exceed 10 per second, even if asked to', () => {
      const { engine, time, snapshots } = setup();
      engine.start(1, { ...settings, snapshotIntervalMs: 10 });
      time.advance(1_000);
      expect(snapshots().length).toBeLessThanOrEqual(10);
    });

    it('are tagged with the run id and carry metrics for every instrument', () => {
      const { engine, time, snapshots } = setup();
      engine.start(42, settings);
      time.advance(300);
      const last = snapshots().at(-1)!;
      expect(snapshots().every((s) => s.runId === 42)).toBe(true);
      expect(decodeMetrics(last.metrics).map((m) => m.instrument)).toEqual([0, 1, 2]);
      expect(last.totalUpdates).toBe(300);
      expect(decodeMetrics(last.metrics).reduce((sum, m) => sum + m.volume, 0)).toBe(300);
      expect(last.timestamp).toBe(time.now);
    });
  });

  describe('pause and resume', () => {
    it('pause stops the timer and generation', () => {
      const { engine, time, statuses } = setup();
      engine.start(1, settings);
      time.advance(200);
      engine.pause();

      expect(engine.status).toBe('paused');
      expect(time.activeTimers).toBe(0);
      expect(statuses()).toEqual(['running', 'paused']);

      time.advance(5_000);
      expect(engine.totalUpdates).toBe(200);
    });

    it('resume continues without catching up on paused time', () => {
      const { engine, time, snapshots } = setup();
      engine.start(1, settings);
      time.advance(200);
      engine.pause();
      time.advance(10_000);
      engine.resume();
      time.advance(300);

      expect(engine.status).toBe('running');
      expect(engine.totalUpdates).toBe(500);
      expect(snapshots().at(-1)!.runId).toBe(1);
    });

    it('limits make-up work after a long gap between ticks', () => {
      const { engine, time } = setup();
      engine.start(1, settings);
      time.jump(30_000);
      time.advance(TICK_MS);
      expect(engine.totalUpdates).toBe(MAX_TICK_GAP_MS);
    });

    it('ignores pause and resume in the wrong state', () => {
      const { engine, time, statuses } = setup();
      engine.pause();
      engine.resume();
      expect(engine.status).toBe('idle');

      engine.start(1, settings);
      engine.resume();
      engine.pause();
      engine.pause();
      expect(statuses()).toEqual(['running', 'paused']);
      expect(time.activeTimers).toBe(0);
    });
  });

  describe('finish', () => {
    it('stops the timer and ignores pause and resume afterwards', () => {
      const { engine, time, statuses } = setup();
      engine.start(1, settings);
      engine.finish();
      engine.resume();
      engine.pause();

      expect(engine.status).toBe('finished');
      expect(time.activeTimers).toBe(0);
      expect(statuses()).toEqual(['running', 'finished']);
    });

    it('allows a new run to start', () => {
      const { engine, time } = setup();
      engine.start(1, settings);
      engine.finish();
      engine.start(2, settings);
      time.advance(100);
      expect(engine.status).toBe('running');
      expect(engine.totalUpdates).toBe(100);
    });
  });

  it('reports a generator failure and ends the run', () => {
    const time = new FakeTime();
    const events: WorkerEvent[] = [];
    const engine = new ProducerEngine({
      createGenerator: () => ({
        generateBatch: () => {
          throw new Error('wasm trapped');
        },
      }),
      scheduler: time,
      clock: time.clock,
      emit: (e) => events.push(e),
    });
    engine.start(1, settings);
    time.advance(TICK_MS);

    expect(events).toContainEqual({ type: 'error', message: 'wasm trapped' });
    expect(engine.status).toBe('finished');
    expect(time.activeTimers).toBe(0);
  });
});
