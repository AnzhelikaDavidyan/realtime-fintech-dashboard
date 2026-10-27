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
  return { service, workers, worker: () => workers.at(-1)! };
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

  describe('worker events', () => {
    it('follows the worker status', () => {
      const { service, worker } = setup();
      worker().emit({ type: 'ready', producerVersion: '0.1.0' });
      worker().emit({ type: 'status', status: 'running' });
      expect(service.status()).toBe('running');
      worker().emit({ type: 'status', status: 'paused' });
      expect(service.status()).toBe('paused');
    });

    it('decodes snapshots of the current run into rows', () => {
      const { service, worker } = setup();
      worker().emit(snapshot(1, [row(0, 5), row(1, 7)]));
      expect(service.rows()).toEqual([row(0, 5), row(1, 7)]);
    });

    it('ignores snapshots from an old run', () => {
      const { service, worker } = setup();
      worker().emit(snapshot(1, [row(0, 5)]));
      service.apply({ instruments: 2 });

      worker().emit(snapshot(1, [row(0, 999)]));
      expect(service.rows()).toEqual([]);

      worker().emit(snapshot(2, [row(0, 1), row(1, 2)]));
      expect(service.rows()).toEqual([row(0, 1), row(1, 2)]);
    });

    it('marks the producer unusable when the worker fails to load', () => {
      const { service, worker } = setup();
      worker().emit({ type: 'error', message: 'Could not download the market engine' });
      expect(service.status()).toBe('error');
      expect(service.error()).toBe('Could not download the market engine');
    });

    it('reports a failed command without changing the status', () => {
      const { service, worker } = setup();
      worker().emit({ type: 'status', status: 'running' });
      worker().emit({ type: 'error', message: 'bad settings', command: 'start' });
      expect(service.status()).toBe('running');
      expect(service.error()).toBe('bad settings');
    });

    it('reports a crashed worker script', () => {
      const { service, worker } = setup();
      worker().crash('Unexpected token');
      expect(service.status()).toBe('error');
      expect(service.error()).toBe('Unexpected token');
    });
  });

  describe('commands', () => {
    it('sends pause and resume to the worker', () => {
      const { service, worker } = setup();
      service.pause();
      service.resume();
      expect(worker().sent.slice(2)).toEqual([{ type: 'pause' }, { type: 'resume' }]);
    });

    it('apply starts a new run with normalized settings', () => {
      const { service, worker } = setup();
      worker().emit(snapshot(1, [row(0, 5)]));
      service.apply({ instruments: 3.4, updatesPerSecond: 1e9 });

      const settings = { ...DEFAULT_PRODUCER_SETTINGS, instruments: 3, updatesPerSecond: 100_000 };
      expect(service.activeSettings()).toEqual(settings);
      expect(service.runId()).toBe(2);
      expect(service.rows()).toEqual([]);
      expect(worker().sent.slice(2)).toEqual([
        { type: 'init', settings },
        { type: 'start', runId: 2 },
      ]);
    });
  });

  it('clears an old error when a new run starts', () => {
    const { service, worker } = setup();
    worker().emit({ type: 'error', message: 'bad settings', command: 'start' });
    service.apply({ instruments: 2 });
    expect(service.error()).toBeNull();
  });

  describe('retry', () => {
    it('replaces the worker and restarts with the active settings', () => {
      const { service, workers } = setup();
      service.apply({ instruments: 4 });
      workers[0].emit({ type: 'error', message: 'boom' });

      service.retry();

      expect(workers).toHaveLength(2);
      expect(workers[0].terminated).toBe(true);
      expect(workers[1].sent).toEqual([
        { type: 'init', settings: { ...DEFAULT_PRODUCER_SETTINGS, instruments: 4 } },
        { type: 'start', runId: 3 },
      ]);
      expect(service.status()).toBe('starting');
      expect(service.error()).toBeNull();
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

  it('terminates the worker when the app is destroyed', () => {
    const { worker } = setup();
    const current = worker();
    TestBed.resetTestingModule();
    expect(current.terminated).toBe(true);
  });
});
