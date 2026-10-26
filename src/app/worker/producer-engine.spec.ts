import { MARKET_UPDATE_STRIDE } from '../core/market-update';
import { decodeMetrics } from '../core/metrics-codec';
import { WorkerEvent } from '../core/worker-protocol';
import { BatchGenerator, MAX_TICK_GAP_MS, ProducerEngine, TICK_MS } from './producer-engine';
import { FakeTime } from './testing/fake-time';

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

  describe('pause, resume and run switching', () => {
    /** Sum of traded volume across instruments in a snapshot. */
    const volumeOf = (s: Extract<WorkerEvent, { type: 'snapshot' }>) =>
      decodeMetrics(s.metrics).reduce((sum, m) => sum + m.volume, 0);

    describe('pause', () => {
      it('stops batches: the generator is not called again', () => {
        const { engine, time, generators } = setup();
        engine.start(1, settings);
        time.advance(200);
        const calls = generators[0].generator.requested.length;

        engine.pause();
        time.advance(5_000);

        expect(generators[0].generator.requested).toHaveLength(calls);
        expect(engine.totalUpdates).toBe(200);
        expect(time.activeTimers).toBe(0);
      });

      it('stops snapshots while paused', () => {
        const { engine, time, snapshots } = setup();
        engine.start(1, settings);
        time.advance(300);
        engine.pause();
        const count = snapshots().length;
        time.advance(5_000);
        expect(snapshots()).toHaveLength(count);
      });
    });

    describe('resume', () => {
      it('keeps the totals from before the pause', () => {
        const { engine, time, snapshots } = setup();
        engine.start(1, settings);
        time.advance(300);
        engine.pause();
        const before = snapshots().at(-1)!;

        engine.resume();
        expect(engine.totalUpdates).toBe(300);

        time.advance(100);
        const after = snapshots().at(-1)!;
        expect(after.totalUpdates).toBe(before.totalUpdates + 100);
        expect(volumeOf(after)).toBe(volumeOf(before) + 100);
      });

      it('generates nothing for the paused time', () => {
        const { engine, time, generators } = setup();
        engine.start(1, settings);
        time.advance(200);
        engine.pause();
        time.advance(10_000);
        engine.resume();
        time.advance(TICK_MS);

        // First batch after resume covers one tick, not the 10 s pause.
        expect(generators[0].generator.requested.at(-1)).toBe(TICK_MS);
        time.advance(300 - TICK_MS);
        expect(engine.totalUpdates).toBe(200 + 300);
      });

      it('does not catch up even after a pause longer than the gap limit', () => {
        const { engine, time } = setup();
        engine.start(1, settings);
        engine.pause();
        time.advance(60_000);
        engine.resume();
        time.advance(100);
        expect(engine.totalUpdates).toBe(100);
      });
    });

    describe('new run', () => {
      it('resets totals and metrics', () => {
        const { engine, time, snapshots } = setup();
        engine.start(1, settings);
        time.advance(700);
        engine.start(2, settings);

        expect(engine.totalUpdates).toBe(0);
        time.advance(100);
        const first = snapshots().at(-1)!;
        expect(first.runId).toBe(2);
        expect(first.totalUpdates).toBe(100);
        expect(volumeOf(first)).toBe(100);
      });

      it('uses a fresh generator and stops calling the old one', () => {
        const { engine, time, generators } = setup();
        engine.start(1, settings);
        time.advance(200);
        engine.start(2, { ...settings, seed: 99 });
        const oldCalls = generators[0].generator.requested.length;
        time.advance(1_000);

        expect(generators[1].seed).toBe(99);
        expect(generators[0].generator.requested).toHaveLength(oldCalls);
        expect(time.activeTimers).toBe(1);
      });

      it('resets a paused run and starts running', () => {
        const { engine, time } = setup();
        engine.start(1, settings);
        time.advance(400);
        engine.pause();
        engine.start(2, settings);
        time.advance(100);

        expect(engine.status).toBe('running');
        expect(engine.totalUpdates).toBe(100);
      });
    });

    describe('run ids', () => {
      it('never sends the old run id after switching, even with a snapshot due', () => {
        const { engine, time, snapshots } = setup();
        engine.start(1, settings);
        time.advance(450); // run 1's next snapshot would be due at 500
        const switchedAt = snapshots().length;
        engine.start(2, settings);
        time.advance(2_000);

        const after = snapshots().slice(switchedAt);
        expect(after.length).toBeGreaterThan(0);
        expect(after.map((s) => s.runId)).toEqual(after.map(() => 2));
      });

      it('only moves forward across several switches, including from pause', () => {
        const { engine, time, snapshots } = setup();
        const switches: [runId: number, from: number][] = [];
        for (const runId of [1, 2, 3, 4]) {
          switches.push([runId, snapshots().length]);
          engine.start(runId, settings);
          time.advance(250);
          if (runId === 2) engine.pause();
        }
        time.advance(500);

        for (const [runId, from] of switches) {
          expect(
            snapshots()
              .slice(from)
              .every((s) => s.runId >= runId),
          ).toBe(true);
        }
        expect(snapshots().at(-1)!.runId).toBe(4);
      });
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
