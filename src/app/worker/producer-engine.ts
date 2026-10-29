import { MetricsAggregator } from '../core/metrics-aggregator';
import { encodeMetrics } from '../core/metrics-codec';
import { normalizeProducerSettings, ProducerSettings } from '../core/producer-settings';
import { WorkerEvent, WorkerStatus } from '../core/worker-protocol';

/** Source of market updates; the Wasm `MarketGenerator` satisfies this. */
export interface BatchGenerator {
  generateBatch(n: number): Int32Array;
  /** Releases the generator's Wasm memory; it must not be used afterwards. */
  free(): void;
}

export type GeneratorFactory = (seed: number, instrumentCount: number) => BatchGenerator;

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

/**
 * Snapshots go to the UI at most this often (about 10 per second).
 *
 * Rendering a snapshot costs the main thread the same whatever the generation
 * rate (about 3.5 ms for 50 instruments in a production build), so this
 * interval alone sets the UI load: about 3.5% of the main thread at 100 ms, 7% at
 * 50 ms. Faster updates are too quick to read, and 250 ms makes the table lag
 * visibly behind the market.
 */
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
 *
 * Snapshots can be paused on their own (`pauseSnapshots`), e.g. while the page
 * is hidden: generation and totals go on, nothing is sent. This holds across
 * runs until `resumeSnapshots`, which sends the latest state at once.
 */
export class ProducerEngine {
  private state: WorkerStatus = 'idle';
  private runId = 0;
  private settings: ProducerSettings = normalizeProducerSettings();
  private generator: BatchGenerator | null = null;
  private metrics: MetricsAggregator | null = null;
  private cancelBatches: (() => void) | null = null;
  private cancelSnapshots: (() => void) | null = null;
  private snapshotsPaused = false;
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

  /** Id of the current (or last) run; 0 before the first `start`. */
  get currentRunId(): number {
    return this.runId;
  }

  /**
   * Starts a fresh run, discarding any previous run's state. The new generator
   * is created first, so if that fails the current run is left untouched.
   */
  start(runId: number, settings: Partial<ProducerSettings>): void {
    const next = normalizeProducerSettings(settings);
    const generator = this.deps.createGenerator(next.seed, next.instrumentCount);

    this.stopTimers();
    this.releaseGenerator();
    this.runId = runId;
    this.settings = next;
    this.generator = generator;
    this.metrics = new MetricsAggregator(next.instrumentCount);
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

  /** Stops sending snapshots; generation goes on. */
  pauseSnapshots(): void {
    this.snapshotsPaused = true;
    this.stopSnapshots();
  }

  /** Sends snapshots again, starting with one now so the UI catches up without waiting. */
  resumeSnapshots(): void {
    if (!this.snapshotsPaused) {
      return;
    }
    this.snapshotsPaused = false;
    if (this.state === 'running') {
      this.snapshot();
      this.startSnapshots();
    }
  }

  /** Ends the run and releases the generator. */
  finish(): void {
    if (this.state === 'finished') {
      return;
    }
    this.stopTimers();
    this.releaseGenerator();
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
    this.cancelBatches = this.deps.scheduler.every(this.settings.batchIntervalMs, () =>
      this.batch(),
    );
    if (!this.snapshotsPaused) {
      this.startSnapshots();
    }
  }

  private startSnapshots(): void {
    this.cancelSnapshots = this.deps.scheduler.every(SNAPSHOT_INTERVAL_MS, () => this.snapshot());
  }

  private stopTimers(): void {
    this.cancelBatches?.();
    this.cancelBatches = null;
    this.stopSnapshots();
  }

  private stopSnapshots(): void {
    this.cancelSnapshots?.();
    this.cancelSnapshots = null;
  }

  /** Frees the current generator now instead of waiting for garbage collection. */
  private releaseGenerator(): void {
    const generator = this.generator;
    this.generator = null;
    try {
      generator?.free();
    } catch {
      // After a Wasm trap freeing can fail too; the generator is unusable either way.
    }
  }

  private setStatus(status: WorkerStatus): void {
    this.state = status;
    this.deps.emit({ type: 'status', status });
  }
}
