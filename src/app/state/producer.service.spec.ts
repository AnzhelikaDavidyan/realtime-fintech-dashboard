import { TestBed } from '@angular/core/testing';

import { InstrumentMetrics } from '../core/instrument-metrics';
import { encodeMetrics } from '../core/metrics-codec';
import { DEFAULT_PRODUCER_SETTINGS } from '../core/producer-settings';
import { WorkerEvent } from '../core/worker-protocol';
import { ProducerService } from './producer.service';
import { FakeProducerWorker, provideFakeProducerWorker } from './testing/fake-producer-worker';

const row = (instrument: number, volume: number): InstrumentMetrics => ({
  instrument,
  bid: 100,
  ask: 101,
  bidQty: 10,
  askQty: 20,
  spread: 1,
  imbalance: -1 / 3,
  lastPrice: 101,
  volume,
  vwap: 101,
});

const snapshot = (runId: number, rows: InstrumentMetrics[]): WorkerEvent => ({
  type: 'snapshot',
  runId,
  metrics: encodeMetrics(rows),
  totalUpdates: rows.length,
  timestamp: 0,
});

function setup() {
  const workers: FakeProducerWorker[] = [];
  TestBed.configureTestingModule({ providers: [provideFakeProducerWorker(workers)] });
  const service = TestBed.inject(ProducerService);
  const worker = () => workers.at(-1)!;
  /** Commands sent after the initial default run (init + start). */
  const sentSinceStartup = () => worker().sent.slice(2);
  return { service, workers, worker, sentSinceStartup };
}

describe('ProducerService', () => {
  describe('startup', () => {
    it('creates the worker once and starts the default run', () => {
      const { service, workers } = setup();
      TestBed.inject(ProducerService);

      expect(workers).toHaveLength(1);
      expect(workers[0].sent).toEqual([
        { type: 'init', settings: DEFAULT_PRODUCER_SETTINGS },
        { type: 'start', runId: 1 },
      ]);
      expect(service.runId()).toBe(1);
      expect(service.activeSettings()).toEqual(DEFAULT_PRODUCER_SETTINGS);
    });

    it('is starting with no rows and no error until the worker reports', () => {
      const { service } = setup();
      expect(service.status()).toBe('starting');
      expect(service.rows()).toEqual([]);
      expect(service.error()).toBeNull();
    });
  });

  describe('apply', () => {
    it('increments the run id every time and starts that run', () => {
      const { service, sentSinceStartup } = setup();
      for (const expected of [2, 3, 4]) {
        service.apply({ instrumentCount: expected });
        expect(service.runId()).toBe(expected);
      }
      const starts = sentSinceStartup().filter((c) => c.type === 'start');
      expect(starts).toEqual([
        { type: 'start', runId: 2 },
        { type: 'start', runId: 3 },
        { type: 'start', runId: 4 },
      ]);
    });

    it('clears the rows immediately, before the new run reports anything', () => {
      const { service, worker } = setup();
      worker().emit(snapshot(1, [row(0, 5), row(1, 7)]));
      expect(service.rows()).toHaveLength(2);

      service.apply({ instrumentCount: 3 });
      expect(service.rows()).toEqual([]);
    });

    it('starts generation even when the producer is paused', () => {
      const { service, worker, sentSinceStartup } = setup();
      worker().emit({ type: 'status', status: 'running' });
      service.pause();
      worker().emit({ type: 'status', status: 'paused' });

      service.apply({ instrumentCount: 2 });

      // A fresh `start`, not a `resume`: the new run runs whatever state the old one was in.
      expect(sentSinceStartup()).toEqual([
        { type: 'pause' },
        { type: 'init', settings: { ...DEFAULT_PRODUCER_SETTINGS, instrumentCount: 2 } },
        { type: 'start', runId: 2 },
      ]);

      worker().emit({ type: 'status', status: 'running' });
      worker().emit(snapshot(2, [row(0, 1), row(1, 1)]));
      expect(service.status()).toBe('running');
      expect(service.rows()).toHaveLength(2);
    });

    it('normalizes the settings it starts with', () => {
      const { service, sentSinceStartup } = setup();
      service.apply({ instrumentCount: 3.4, updatesPerBatch: 1e9 });

      const settings = { ...DEFAULT_PRODUCER_SETTINGS, instrumentCount: 3, updatesPerBatch: 1_000 };
      expect(service.activeSettings()).toEqual(settings);
      expect(sentSinceStartup()[0]).toEqual({ type: 'init', settings });
    });
  });

  describe('total updates', () => {
    it('follows the current run and resets for a new one', () => {
      const { service, worker } = setup();
      expect(service.totalUpdates()).toBe(0);
      worker().emit({ ...snapshot(1, [row(0, 5)]), totalUpdates: 1_200 } as WorkerEvent);
      expect(service.totalUpdates()).toBe(1_200);

      service.apply({ instrumentCount: 1 });
      expect(service.totalUpdates()).toBe(0);

      worker().emit({ ...snapshot(1, [row(0, 5)]), totalUpdates: 9_999 } as WorkerEvent);
      expect(service.totalUpdates()).toBe(0);
    });
  });

  describe('pause and resume', () => {
    it('sends pause and resume and follows the status the worker reports', () => {
      const { service, worker, sentSinceStartup } = setup();
      worker().emit({ type: 'status', status: 'running' });

      service.pause();
      worker().emit({ type: 'status', status: 'paused' });
      expect(service.status()).toBe('paused');

      service.resume();
      worker().emit({ type: 'status', status: 'running' });
      expect(service.status()).toBe('running');

      expect(sentSinceStartup()).toEqual([{ type: 'pause' }, { type: 'resume' }]);
    });

    it('keeps the run and its rows while paused', () => {
      const { service, worker } = setup();
      worker().emit(snapshot(1, [row(0, 5)]));
      service.pause();
      worker().emit({ type: 'status', status: 'paused' });
      service.resume();

      expect(service.runId()).toBe(1);
      expect(service.rows()).toEqual([row(0, 5)]);
    });
  });

  describe('stale runs', () => {
    it('ignores late snapshots from the previous run', () => {
      const { service, worker } = setup();
      service.apply({ instrumentCount: 2 });

      worker().emit(snapshot(1, [row(0, 999)]));
      expect(service.rows()).toEqual([]);

      worker().emit(snapshot(2, [row(0, 1), row(1, 2)]));
      expect(service.rows()).toEqual([row(0, 1), row(1, 2)]);
    });

    it('accepts only the latest run after several switches', () => {
      const { service, worker } = setup();
      service.apply({ instrumentCount: 1 });
      service.apply({ instrumentCount: 1 });
      service.apply({ instrumentCount: 1 });

      for (const runId of [1, 2, 3, 99]) {
        worker().emit(snapshot(runId, [row(0, runId)]));
      }
      expect(service.rows()).toEqual([]);

      worker().emit(snapshot(4, [row(0, 4)]));
      expect(service.rows()).toEqual([row(0, 4)]);
    });

    it('does not let a stale snapshot overwrite fresh rows', () => {
      const { service, worker } = setup();
      service.apply({ instrumentCount: 1 });
      worker().emit(snapshot(2, [row(0, 20)]));
      worker().emit(snapshot(1, [row(0, 10)]));
      expect(service.rows()).toEqual([row(0, 20)]);
    });
  });

  describe('errors', () => {
    it('shows a load failure and marks the producer unusable', () => {
      const { service, worker } = setup();
      worker().emit({ type: 'error', message: 'Could not download the market engine' });
      expect(service.status()).toBe('error');
      expect(service.error()).toBe('Could not download the market engine');
    });

    it('shows a failed command without changing the status', () => {
      const { service, worker } = setup();
      worker().emit({ type: 'status', status: 'running' });
      worker().emit({ type: 'error', message: 'bad settings', command: 'start' });
      expect(service.status()).toBe('running');
      expect(service.error()).toBe('bad settings');
    });

    it.each(['init', 'start'] as const)(
      'marks the producer unusable when the run fails to start (%s)',
      (command) => {
        const { service, worker } = setup();
        worker().emit({ type: 'error', message: 'Generator rejected the seed', command });
        expect(service.status()).toBe('error');
        expect(service.error()).toBe('Generator rejected the seed');
      },
    );

    it('keeps the load failure message when queued commands then fail too', () => {
      const { service, worker } = setup();
      worker().emit({ type: 'error', message: 'Could not download the market engine' });
      worker().emit({
        type: 'error',
        message: 'The market engine is unavailable: Could not download the market engine',
        command: 'start',
      });
      expect(service.error()).toBe('Could not download the market engine');
    });

    it('keeps showing why a run ended', () => {
      const { service, worker } = setup();
      worker().emit({ type: 'error', message: 'wasm trapped' });
      worker().emit({ type: 'status', status: 'finished' });
      expect(service.status()).toBe('finished');
      expect(service.error()).toBe('wasm trapped');
    });

    it('shows a crashed worker script', () => {
      const { service, worker } = setup();
      worker().crash('Unexpected token');
      expect(service.status()).toBe('error');
      expect(service.error()).toBe('Unexpected token');
    });

    it('clears an old error when a new run starts', () => {
      const { service, worker } = setup();
      worker().emit({ type: 'error', message: 'bad settings', command: 'start' });
      service.apply({ instrumentCount: 2 });
      expect(service.error()).toBeNull();
    });
  });

  describe('retry', () => {
    it('replaces the worker and restarts with the active settings', () => {
      const { service, workers } = setup();
      service.apply({ instrumentCount: 4 });
      workers[0].emit({ type: 'error', message: 'boom' });

      service.retry();

      expect(workers).toHaveLength(2);
      expect(workers[0].terminated).toBe(true);
      expect(workers[1].sent).toEqual([
        { type: 'init', settings: { ...DEFAULT_PRODUCER_SETTINGS, instrumentCount: 4 } },
        { type: 'start', runId: 3 },
      ]);
      expect(service.status()).toBe('starting');
      expect(service.error()).toBeNull();
    });

    it('lets Apply replace a worker that can no longer answer', () => {
      const { service, workers } = setup();
      workers[0].crash('Script error');

      service.apply({ instrumentCount: 2 });

      expect(workers).toHaveLength(2);
      expect(workers[0].terminated).toBe(true);
      expect(workers[1].sent).toEqual([
        { type: 'init', settings: { ...DEFAULT_PRODUCER_SETTINGS, instrumentCount: 2 } },
        { type: 'start', runId: 2 },
      ]);
      expect(service.status()).toBe('starting');
    });

    it('keeps the worker when Apply follows a run that only stopped', () => {
      const { service, workers } = setup();
      workers[0].emit({ type: 'status', status: 'finished' });
      service.apply({ instrumentCount: 2 });
      expect(workers).toHaveLength(1);
    });

    it('ignores anything the replaced worker still sends', () => {
      const { service, workers } = setup();
      service.retry();
      workers[0].emit({ type: 'status', status: 'paused' });
      workers[0].emit(snapshot(2, [row(0, 9)]));
      workers[0].crash('late crash');

      expect(service.status()).toBe('starting');
      expect(service.rows()).toEqual([]);
      expect(service.error()).toBeNull();
    });
  });

  describe('run outcome', () => {
    it('is pending until the worker confirms the run is running', () => {
      const { service, worker } = setup();
      expect(service.runOutcome()).toBe('pending');
      worker().emit({ type: 'ready', producerVersion: '1' });
      expect(service.runOutcome()).toBe('pending');
      worker().emit({ type: 'status', status: 'running' });
      expect(service.runOutcome()).toBe('started');
    });

    it('is not confirmed by a paused status from an earlier command', () => {
      const { service, worker } = setup();
      worker().emit({ type: 'status', status: 'paused' });
      expect(service.runOutcome()).toBe('pending');
    });

    it('goes back to pending for every new run', () => {
      const { service, worker } = setup();
      worker().emit({ type: 'status', status: 'running' });
      service.apply({ instrumentCount: 3 });
      expect(service.runOutcome()).toBe('pending');
    });

    it('stays started when the run is later paused', () => {
      const { service, worker } = setup();
      worker().emit({ type: 'status', status: 'running' });
      worker().emit({ type: 'status', status: 'paused' });
      expect(service.runOutcome()).toBe('started');
    });

    it.each(['init', 'start'] as const)('fails when the %s command fails', (command) => {
      const { service, worker } = setup();
      worker().emit({ type: 'error', message: 'Bad settings', command });
      expect(service.runOutcome()).toBe('failed');
    });

    it('is not failed by an error from another command', () => {
      const { service, worker } = setup();
      worker().emit({ type: 'error', message: 'Not running', command: 'pause' });
      expect(service.runOutcome()).toBe('pending');
    });

    it('fails when the worker cannot load or crashes, even after the run started', () => {
      const { service, worker } = setup();
      worker().emit({ type: 'status', status: 'running' });
      worker().crash('Script error');
      expect(service.runOutcome()).toBe('failed');
    });
  });

  it('terminates the worker when the app is destroyed', () => {
    const { worker } = setup();
    const current = worker();
    TestBed.resetTestingModule();
    expect(current.terminated).toBe(true);
  });
});
