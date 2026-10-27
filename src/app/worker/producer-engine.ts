import { MetricsAggregator } from '../core/metrics-aggregator';
import { encodeMetrics } from '../core/metrics-codec';
import { normalizeProducerSettings, ProducerSettings } from '../core/producer-settings';
import { WorkerEvent, WorkerStatus } from '../core/worker-protocol';

/** Source of market updates; the Wasm `MarketGenerator` satisfies this. */
export interface BatchGenerator {
  generateBatch(n: number): Int32Array;
}

export type GeneratorFactory = (seed: number, instruments: number) => BatchGenerator;

/** Repeating timer; returns a function that cancels it. */
export interface Scheduler {
  every(intervalMs: number, callback: () => void): () => void;
}

/** Monotonic milliseconds, e.g. `performance.now()`. */
export type Clock = () => number;

export interface ProducerEngineDeps {
  readonly createGenerator: GeneratorFactory;
  readonly scheduler: Scheduler;
  readonly clock: Clock;
  readonly emit: (event: WorkerEvent) => void;
}

/** Snapshots go to the UI at most this often (about 10 per second). */
export const SNAPSHOT_INTERVAL_MS = 100;

/**
 * Generates `updatesPerBatch` updates every `batchIntervalMs`, folds them into
 * metrics, and sends a snapshot tagged with the run id at most every
 * SNAPSHOT_INTERVAL_MS, and only when a batch has changed something.
 *
 * Lifecycle: idle → start → running ⇄ pause/resume → finish → finished.
 * `start` is allowed from any state and begins a fresh run. `pause` outside
 * `running`, and `resume` outside `paused`, are ignored. After `finish` only
 * `start` does anything.
 */
export class ProducerEngine {
  private state: WorkerStatus = 'idle';
  private runId = 0;
  private settings: ProducerSettings = normalizeProducerSettings();
  private generator: BatchGenerator | null = null;
  private metrics: MetricsAggregator | null = null;
  private cancelTimers: (() => void) | null = null;
  private generated = 0;
  /** True when a batch arrived since the last snapshot. */
  private changed = false;

  constructor(private readonly deps: ProducerEngineDeps) {}

  get status(): WorkerStatus {
    return this.state;
  }

  get totalUpdates(): number {
    return this.generated;
  }

  /**
   * Starts a fresh run, discarding any previous run's state. The new generator
   * is created first, so if that fails the current run is left untouched.
   */
  start(runId: number, settings: Partial<ProducerSettings>): void {
    const next = normalizeProducerSettings(settings);
    const generator = this.deps.createGenerator(next.seed, next.instruments);

    this.stopTimers();
    this.runId = runId;
    this.settings = next;
    this.generator = generator;
    this.metrics = new MetricsAggregator(next.instruments);
    this.generated = 0;
    this.changed = false;
    this.startTimers();
    this.setStatus('running');
  }

  /** Stops generating; metrics are kept. */
  pause(): void {
    if (this.state !== 'running') {
      return;
    }
    this.stopTimers();
    this.setStatus('paused');
  }

  /** Continues with the next batch; time spent paused is never made up. */
  resume(): void {
    if (this.state !== 'paused') {
      return;
    }
    this.startTimers();
    this.setStatus('running');
  }

  /** Ends the run and releases the generator. */
  finish(): void {
    if (this.state === 'finished') {
      return;
    }
    this.stopTimers();
    this.generator = null;
    this.setStatus('finished');
  }

  private batch(): void {
    if (this.state !== 'running' || !this.generator || !this.metrics) {
      return;
    }
    try {
      this.metrics.ingest(this.generator.generateBatch(this.settings.updatesPerBatch));
      this.generated += this.settings.updatesPerBatch;
      this.changed = true;
    } catch (error) {
      // A failing generator would fail again on every batch, so end the run.
      this.deps.emit({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      this.finish();
    }
  }

  private snapshot(): void {
    if (this.state !== 'running' || !this.metrics || !this.changed) {
      return;
    }
    this.changed = false;
    this.deps.emit({
      type: 'snapshot',
      runId: this.runId,
      metrics: encodeMetrics(this.metrics.snapshot()),
      totalUpdates: this.generated,
      timestamp: this.deps.clock(),
    });
  }

  private startTimers(): void {
    const stopBatches = this.deps.scheduler.every(this.settings.batchIntervalMs, () =>
      this.batch(),
    );
    const stopSnapshots = this.deps.scheduler.every(SNAPSHOT_INTERVAL_MS, () => this.snapshot());
    this.cancelTimers = () => {
      stopBatches();
      stopSnapshots();
    };
  }

  private stopTimers(): void {
    this.cancelTimers?.();
    this.cancelTimers = null;
  }

  private setStatus(status: WorkerStatus): void {
    this.state = status;
    this.deps.emit({ type: 'status', status });
  }
}
