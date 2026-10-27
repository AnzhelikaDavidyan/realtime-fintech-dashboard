import { DestroyRef, inject, Injectable, InjectionToken, signal } from '@angular/core';

import { InstrumentMetrics } from '../core/instrument-metrics';
import { decodeMetrics } from '../core/metrics-codec';
import {
  DEFAULT_PRODUCER_SETTINGS,
  normalizeProducerSettings,
  ProducerSettings,
} from '../core/producer-settings';
import { WorkerCommand, WorkerEvent, WorkerStatus } from '../core/worker-protocol';

/** The part of `Worker` the service uses, so tests can pass a fake. */
export interface ProducerWorker {
  onmessage: ((event: MessageEvent<WorkerEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(command: WorkerCommand): void;
  terminate(): void;
}

/** Creates the producer worker. Overridden in tests. */
export const PRODUCER_WORKER_FACTORY = new InjectionToken<() => ProducerWorker>(
  'PRODUCER_WORKER_FACTORY',
  {
    providedIn: 'root',
    factory: () => () =>
      new Worker(new URL('../worker/producer.worker', import.meta.url), { type: 'module' }),
  },
);

/** Worker lifecycle plus `starting` (worker loading) and `error` (worker unusable). */
export type ProducerStatus = WorkerStatus | 'starting' | 'error';

/**
 * App-wide access to the market data producer.
 *
 * Creates the Web Worker once and starts a run with the default settings.
 * Every `apply` or `retry` starts a new run with a new id; snapshots from any
 * earlier run are ignored, so the screen never shows stale data.
 */
@Injectable({ providedIn: 'root' })
export class ProducerService {
  private readonly createWorker = inject(PRODUCER_WORKER_FACTORY);
  private worker: ProducerWorker | null = null;
  private lastRunId = 0;

  private readonly _status = signal<ProducerStatus>('starting');
  private readonly _rows = signal<readonly InstrumentMetrics[]>([]);
  private readonly _totalUpdates = signal(0);
  private readonly _runId = signal(0);
  private readonly _activeSettings = signal<ProducerSettings>(DEFAULT_PRODUCER_SETTINGS);
  private readonly _error = signal<string | null>(null);

  readonly status = this._status.asReadonly();
  /** Latest metrics for every instrument, from the current run only. */
  readonly rows = this._rows.asReadonly();
  /** Updates generated in the current run (each one carries a trade). */
  readonly totalUpdates = this._totalUpdates.asReadonly();
  readonly runId = this._runId.asReadonly();
  readonly activeSettings = this._activeSettings.asReadonly();
  /** Last problem reported by the worker, or null. */
  readonly error = this._error.asReadonly();

  constructor() {
    this.replaceWorker();
    this.startRun(DEFAULT_PRODUCER_SETTINGS);
    inject(DestroyRef).onDestroy(() => this.terminateWorker());
  }

  pause(): void {
    this.send({ type: 'pause' });
  }

  resume(): void {
    this.send({ type: 'resume' });
  }

  /** Starts a new run with the given settings (missing values use defaults). */
  apply(settings: Partial<ProducerSettings>): void {
    this.startRun(normalizeProducerSettings(settings));
  }

  /** Replaces the worker and starts a new run with the active settings. */
  retry(): void {
    this.replaceWorker();
    this.startRun(this._activeSettings());
  }

  private startRun(settings: ProducerSettings): void {
    const runId = ++this.lastRunId;
    this._runId.set(runId);
    this._activeSettings.set(settings);
    this._rows.set([]);
    this._totalUpdates.set(0);
    this._error.set(null);
    this.send({ type: 'init', settings });
    this.send({ type: 'start', runId });
  }

  private replaceWorker(): void {
    this.terminateWorker();
    this._status.set('starting');
    this._error.set(null);

    const worker = this.createWorker();
    worker.onmessage = ({ data }) => this.handle(data);
    worker.onerror = (event) =>
      this.fail(event.message || 'The market data worker could not start.');
    this.worker = worker;
  }

  /** Stops the worker; clearing its handlers first means nothing it still sends is used. */
  private terminateWorker(): void {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
  }

  private handle(event: WorkerEvent): void {
    switch (event.type) {
      case 'ready':
        break;
      case 'status':
        this._status.set(event.status);
        break;
      case 'snapshot':
        if (event.runId === this._runId()) {
          this._rows.set(decodeMetrics(event.metrics));
          this._totalUpdates.set(event.totalUpdates);
        }
        break;
      case 'error':
        // Not tied to a command: Wasm failed to load or the run itself failed,
        // so nothing more will arrive until `retry`.
        if (event.command === undefined) {
          this.fail(event.message);
        } else if (this._status() !== 'error') {
          // Once the worker is unusable, the first message says why; the errors
          // for commands that were waiting would only repeat it.
          this._error.set(event.message);
        }
        break;
    }
  }

  private fail(message: string): void {
    this._error.set(message);
    this._status.set('error');
  }

  private send(command: WorkerCommand): void {
    this.worker?.postMessage(command);
  }
}
