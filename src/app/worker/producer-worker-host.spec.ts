import { MARKET_UPDATE_STRIDE } from '../core/market-update';
import { decodeMetrics } from '../core/metrics-codec';
import { WorkerEvent } from '../core/worker-protocol';
import { ProducerWasm } from './load-producer-wasm';
import { ProducerWorkerHost } from './producer-worker-host';
import { FakeTime } from './testing/fake-time';

const fakeWasm: ProducerWasm = {
  version: '0.1.0',
  createGenerator: (_seed, instrumentCount) => ({
    generateBatch: (n) => {
      const out = new Int32Array(n * MARKET_UPDATE_STRIDE);
      for (let i = 0; i < n; i++) {
        out.set([i % instrumentCount, 100, 101, 10, 10, 101, 1], i * MARKET_UPDATE_STRIDE);
      }
      return out;
    },
    free: () => undefined,
  }),
};

function setup(loadWasm: () => Promise<ProducerWasm> = () => Promise.resolve(fakeWasm)) {
  const time = new FakeTime(0);
  const posted: { message: WorkerEvent; transfer: Transferable[] }[] = [];
  const host = new ProducerWorkerHost({
    port: { postMessage: (message, transfer) => posted.push({ message, transfer }) },
    loadWasm,
    scheduler: time,
    clock: time.clock,
  });
  const messages = () => posted.map((p) => p.message);
  const ofType = <T extends WorkerEvent['type']>(type: T) =>
    messages().filter((m): m is Extract<WorkerEvent, { type: T }> => m.type === type);
  return { host, time, posted, messages, ofType };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('ProducerWorkerHost', () => {
  describe('loading', () => {
    it('posts ready with the producer version once Wasm has loaded', async () => {
      const { host, messages } = setup();
      await host.loaded;
      expect(messages()).toEqual([{ type: 'ready', producerVersion: '0.1.0' }]);
    });

    it('posts a readable error when Wasm fails to load', async () => {
      const { host, messages } = setup(() =>
        Promise.reject(
          new Error('Could not download the market engine (/wasm/x.wasm): server answered 404'),
        ),
      );
      await host.loaded;
      expect(messages()).toEqual([
        {
          type: 'error',
          message: 'Could not download the market engine (/wasm/x.wasm): server answered 404',
        },
      ]);
    });

    it('answers commands after a failed load with an error naming the command', async () => {
      const { host, ofType } = setup(() => Promise.reject(new Error('boom')));
      await host.loaded;
      host.receive({ type: 'start', runId: 1 });
      expect(ofType('error').at(-1)).toEqual({
        type: 'error',
        message: 'The market engine is unavailable: boom',
        command: 'start',
      });
    });
  });

  describe('routing', () => {
    it('queues commands sent before Wasm is ready and runs them afterwards', async () => {
      const wasm = deferred<ProducerWasm>();
      const { host, messages, ofType } = setup(() => wasm.promise);
      host.receive({ type: 'init', settings: { instrumentCount: 2 } });
      host.receive({ type: 'start', runId: 5 });
      expect(messages()).toEqual([]);

      wasm.resolve(fakeWasm);
      await host.loaded;
      // Nothing is posted before Wasm loads; then ready comes first and the queued commands run.
      expect(messages()[0].type).toBe('ready');
      expect(ofType('status').map((s) => s.status)).toEqual(['running']);
    });

    it('routes start, pause, resume and finish to the engine', async () => {
      const { host, ofType } = setup();
      await host.loaded;
      host.receive({ type: 'start', runId: 1 });
      host.receive({ type: 'pause' });
      host.receive({ type: 'resume' });
      host.receive({ type: 'finish' });
      expect(ofType('status').map((s) => s.status)).toEqual([
        'running',
        'paused',
        'running',
        'finished',
      ]);
    });

    it('starts runs with the settings from init', async () => {
      const { host, time, ofType } = setup();
      await host.loaded;
      host.receive({
        type: 'init',
        settings: { instrumentCount: 4, updatesPerBatch: 250, batchIntervalMs: 125 },
      });
      host.receive({ type: 'start', runId: 9 });
      time.advance(500);
      const last = ofType('snapshot').at(-1)!;
      expect(last.runId).toBe(9);
      // 500 / 125 = 4 batches of 250.
      expect(last.totalUpdates).toBe(1_000);
      expect(decodeMetrics(last.metrics)).toHaveLength(4);
    });

    it('rejects unknown or malformed messages with a readable error', async () => {
      const { host, ofType } = setup();
      await host.loaded;
      // Unknown type, start without runId, init without settings, not an object, null.
      for (const bad of [{ type: 'explode' }, { type: 'start' }, { type: 'init' }, 'start', null]) {
        host.receive(bad);
      }
      expect(ofType('error')).toHaveLength(5);
      expect(ofType('error')[0].message).toContain('Unknown command');
      expect(ofType('status')).toHaveLength(0);
    });
  });

  describe('transfer', () => {
    it('transfers the snapshot buffer instead of copying it', async () => {
      const { host, time, posted } = setup();
      await host.loaded;
      host.receive({ type: 'start', runId: 1 });
      // Default settings: the first batch lands after 500 ms, its snapshot within 100 ms.
      time.advance(600);
      const snapshot = posted.find((p) => p.message.type === 'snapshot')!;
      const metrics = (snapshot.message as Extract<WorkerEvent, { type: 'snapshot' }>).metrics;
      expect(snapshot.transfer).toEqual([metrics.buffer]);
    });

    it('transfers nothing for other messages', async () => {
      const { host, posted } = setup();
      await host.loaded;
      host.receive({ type: 'start', runId: 1 });
      expect(
        posted.filter((p) => p.message.type !== 'snapshot').every((p) => p.transfer.length === 0),
      ).toBe(true);
    });
  });
});
