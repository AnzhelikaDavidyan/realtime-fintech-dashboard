import { MARKET_UPDATE_STRIDE } from '../core/market-update';
import { decodeMetrics } from '../core/metrics-codec';
import { WorkerEvent } from '../core/worker-protocol';
import { BatchGenerator, ProducerEngine, SNAPSHOT_INTERVAL_MS } from './producer-engine';
import { FakeTime } from './testing/fake-time';

/** Generator stub: valid updates spread over instruments, trade quantity 1. */
class FakeGenerator implements BatchGenerator {
  readonly requested: number[] = [];
  freed = 0;
  constructor(private readonly instrumentCount: number) {}

  free(): void {
    this.freed++;
  }

  generateBatch(n: number): Int32Array {
    this.requested.push(n);
    const out = new Int32Array(n * MARKET_UPDATE_STRIDE);
    for (let i = 0; i < n; i++) {
      out.set([i % this.instrumentCount, 100, 101, 10, 10, 101, 1], i * MARKET_UPDATE_STRIDE);
    }
    return out;
  }
}

function setup() {
  const time = new FakeTime();
  const events: WorkerEvent[] = [];
  const generators: { seed: number; instrumentCount: number; generator: FakeGenerator }[] = [];
  let failNextGenerator = false;
  const engine = new ProducerEngine({
    createGenerator: (seed, instrumentCount) => {
      if (failNextGenerator) {
        failNextGenerator = false;
        throw new Error('bad settings');
      }
      const generator = new FakeGenerator(instrumentCount);
      generators.push({ seed, instrumentCount, generator });
      return generator;
    },
    scheduler: time,
    clock: time.clock,
    emit: (e) => events.push(e),
  });
  const snapshots = () => events.filter((e) => e.type === 'snapshot');
  const statuses = () => events.filter((e) => e.type === 'status').map((e) => e.status);
  const failNext = () => (failNextGenerator = true);
  return { time, events, generators, engine, snapshots, statuses, failNext };
}

/** 10 updates every 100 ms: a nominal 100 updates / second. */
const settings = { seed: 7, instrumentCount: 3, updatesPerBatch: 10, batchIntervalMs: 100 };

/** Sum of traded volume across instruments in a snapshot. */
const volumeOf = (s: Extract<WorkerEvent, { type: 'snapshot' }>) =>
  decodeMetrics(s.metrics).reduce((sum, m) => sum + m.volume, 0);

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
      expect(generators[0]).toMatchObject({ seed: 7, instrumentCount: 3 });
      expect(engine.status).toBe('running');
      expect(statuses()).toEqual(['running']);
      expect(time.activeTimers).toBe(2); // batches + snapshots
    });

    it('generates updatesPerBatch updates every batchIntervalMs', () => {
      const { engine, time, generators } = setup();
      engine.start(1, settings);
      time.advance(1_000);
      expect(generators[0].generator.requested).toEqual(Array(10).fill(10));
      expect(engine.totalUpdates).toBe(100);
    });

    it('waits a full interval before the first batch', () => {
      const { engine, time } = setup();
      // Intervals fire at the end of each period, not at time 0.
      engine.start(1, { ...settings, batchIntervalMs: 500 });
      time.advance(499);
      expect(engine.totalUpdates).toBe(0);
      time.advance(1);
      expect(engine.totalUpdates).toBe(10);
    });

    it('normalizes settings before using them', () => {
      const { engine, generators } = setup();
      engine.start(1, { instrumentCount: 0 });
      expect(generators[0].instrumentCount).toBe(1);
    });

    it('leaves the current run untouched if the new generator cannot be created', () => {
      const { engine, time, snapshots, failNext } = setup();
      engine.start(1, settings);
      time.advance(200);
      failNext();

      expect(() => engine.start(2, settings)).toThrow('bad settings');
      expect(engine.status).toBe('running');
      expect(time.activeTimers).toBe(2);
      time.advance(200);
      expect(snapshots().at(-1)!.runId).toBe(1);
      // 4 batches of 10: run 1 kept going after the failed switch.
      expect(engine.totalUpdates).toBe(40);
    });
  });

  describe('snapshots', () => {
    it('are sent at most every 100 ms (about 10 per second) with fast batches', () => {
      const { engine, time, snapshots } = setup();
      // 20 batches a second (200 updates), but still only 10 snapshots.
      engine.start(1, { ...settings, batchIntervalMs: 50 });
      time.advance(1_000);
      expect(snapshots()).toHaveLength(1_000 / SNAPSHOT_INTERVAL_MS);
      expect(snapshots().at(-1)!.totalUpdates).toBe(200);
    });

    it('are only sent when a batch changed something', () => {
      const { engine, time, snapshots } = setup();
      engine.start(1, { ...settings, batchIntervalMs: 500 });
      time.advance(1_000);
      // Batches land at 500 and 1000 ms only, so 8 of the 10 snapshot ticks have nothing new.
      expect(snapshots()).toHaveLength(2);
    });

    it('are tagged with the run id and carry metrics for every instrument', () => {
      const { engine, time, snapshots } = setup();
      engine.start(42, settings);
      time.advance(300);
      const last = snapshots().at(-1)!;
      expect(snapshots().every((s) => s.runId === 42)).toBe(true);
      expect(decodeMetrics(last.metrics).map((m) => m.instrument)).toEqual([0, 1, 2]);
      expect(last.totalUpdates).toBe(30);
      expect(volumeOf(last)).toBe(30);
      expect(last.timestamp).toBe(time.now);
    });
  });

  describe('pause, resume and run switching', () => {
    describe('pause', () => {
      it('stops batches: the generator is not called again', () => {
        const { engine, time, generators } = setup();
        engine.start(1, settings);
        time.advance(200);
        const calls = generators[0].generator.requested.length;

        engine.pause();
        time.advance(5_000);

        expect(generators[0].generator.requested).toHaveLength(calls);
        expect(engine.totalUpdates).toBe(20);
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
        expect(engine.totalUpdates).toBe(30);

        time.advance(100);
        const after = snapshots().at(-1)!;
        expect(after.totalUpdates).toBe(before.totalUpdates + 10);
        expect(volumeOf(after)).toBe(volumeOf(before) + 10);
      });

      it('generates nothing for the paused time', () => {
        const { engine, time } = setup();
        engine.start(1, settings);
        time.advance(200);
        engine.pause();
        time.advance(60_000);
        engine.resume();
        time.advance(300);
        expect(engine.totalUpdates).toBe(20 + 30);
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
        expect(first.totalUpdates).toBe(10);
        expect(volumeOf(first)).toBe(10);
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
        expect(time.activeTimers).toBe(2);
      });

      it('frees the replaced generator once and keeps the new one', () => {
        const { engine, generators, failNext } = setup();
        engine.start(1, settings);
        failNext();
        expect(() => engine.start(2, settings)).toThrow('bad settings');
        // A failed start must not free the running generator.
        expect(generators[0].generator.freed).toBe(0);

        engine.start(3, settings);
        expect(generators[0].generator.freed).toBe(1);
        // generators[1] is run 3's: the failed run never created one.
        expect(generators[1].generator.freed).toBe(0);
      });

      it('uses the new batch size and interval', () => {
        const { engine, time, generators } = setup();
        engine.start(1, settings);
        engine.start(2, { ...settings, updatesPerBatch: 7, batchIntervalMs: 250 });
        time.advance(1_000);
        // 1000 / 250 = 4 batches; run 1 was replaced at time 0, before its first batch.
        expect(generators[1].generator.requested).toEqual([7, 7, 7, 7]);
      });

      it('resets a paused run and starts running', () => {
        const { engine, time } = setup();
        engine.start(1, settings);
        time.advance(400);
        engine.pause();
        engine.start(2, settings);
        time.advance(100);

        // 10, not 40 + 10: the new run starts from zero, even from pause.
        expect(engine.status).toBe('running');
        expect(engine.totalUpdates).toBe(10);
      });
    });

    describe('run ids', () => {
      it('never sends the old run id after switching, even with a snapshot due', () => {
        const { engine, time, snapshots } = setup();
        engine.start(1, settings);
        time.advance(450); // run 1 has a batch waiting for its next snapshot
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

        // Every snapshot after a switch belongs to that run or a later one: run ids never go back.
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

    it('ignores pause and resume in the wrong state', () => {
      const { engine, time, statuses } = setup();
      engine.pause();
      engine.resume();
      expect(engine.status).toBe('idle');

      engine.start(1, settings);
      engine.resume();
      engine.pause();
      engine.pause();
      // Resume while running and a second pause change nothing, so no extra statuses.
      expect(statuses()).toEqual(['running', 'paused']);
      expect(time.activeTimers).toBe(0);
    });
  });

  describe('finish', () => {
    it('stops the timers and ignores pause and resume afterwards', () => {
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
      expect(engine.totalUpdates).toBe(10);
    });

    it('frees the generator once', () => {
      const { engine, generators } = setup();
      engine.start(1, settings);
      engine.finish();
      engine.finish();
      expect(generators[0].generator.freed).toBe(1);
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
        // A trapped Wasm instance can fail to free as well.
        free: () => {
          throw new Error('wasm trapped');
        },
      }),
      scheduler: time,
      clock: time.clock,
      emit: (e) => events.push(e),
    });
    engine.start(1, settings);
    time.advance(settings.batchIntervalMs);

    expect(events).toContainEqual({ type: 'error', message: 'wasm trapped' });
    expect(engine.status).toBe('finished');
    expect(time.activeTimers).toBe(0);
  });
});
