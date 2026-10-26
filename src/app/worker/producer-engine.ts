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

/** How often the engine wakes up to generate updates. */
export const TICK_MS = 50;
/** Longest gap one tick makes up for (e.g. after a throttled background tab). */
export const MAX_TICK_GAP_MS = 1_000;

/**
 * Drives the market generator at a target rate, folds updates into metrics
 * and emits throttled snapshots tagged with the current run id.
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
  private cancelTimer: (() => void) | null = null;
  private lastTickAt = 0;
  private lastSnapshotAt = 0;
  /** Fraction of an update owed from earlier ticks, so low rates stay accurate. */
  private carry = 0;
  private generated = 0;

  constructor(private readonly deps: ProducerEngineDeps) {}

  get status(): WorkerStatus {
    return this.state;
  }

  get totalUpdates(): number {
    return this.generated;
  }

  /** Starts a fresh run, discarding any previous run's state. */
  start(runId: number, settings: Partial<ProducerSettings>): void {
    this.stopTimer();
    this.runId = runId;
    this.settings = normalizeProducerSettings(settings);
    this.generator = this.deps.createGenerator(this.settings.seed, this.settings.instruments);
    this.metrics = new MetricsAggregator(this.settings.instruments);
    this.carry = 0;
    this.generated = 0;
    const now = this.deps.clock();
    this.lastTickAt = now;
    this.lastSnapshotAt = now;
    this.startTimer();
    this.setStatus('running');
  }

  /** Stops generating; metrics are kept. */
  pause(): void {
    if (this.state !== 'running') {
      return;
    }
    this.stopTimer();
    this.setStatus('paused');
  }

  /** Continues from now; time spent paused is not generated afterwards. */
  resume(): void {
    if (this.state !== 'paused') {
      return;
    }
    this.lastTickAt = this.deps.clock();
    this.carry = 0;
    this.startTimer();
    this.setStatus('running');
  }

  /** Ends the run and releases the generator. */
  finish(): void {
    if (this.state === 'finished') {
      return;
    }
    this.stopTimer();
    this.generator = null;
    this.setStatus('finished');
  }

  private tick(): void {
    if (this.state !== 'running' || !this.generator || !this.metrics) {
      return;
    }
    try {
      this.step(this.generator, this.metrics);
    } catch (error) {
      // A failing generator would fail again on every tick, so end the run.
      this.deps.emit({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      this.finish();
    }
  }

  private step(generator: BatchGenerator, metrics: MetricsAggregator): void {
    const now = this.deps.clock();
    const elapsed = Math.min(now - this.lastTickAt, MAX_TICK_GAP_MS);
    this.lastTickAt = now;

    const due = (elapsed * this.settings.updatesPerSecond) / 1_000 + this.carry;
    const count = Math.floor(due);
    this.carry = due - count;
    if (count > 0) {
      metrics.ingest(generator.generateBatch(count));
      this.generated += count;
    }

    if (now - this.lastSnapshotAt >= this.settings.snapshotIntervalMs) {
      this.lastSnapshotAt = now;
      this.deps.emit({
        type: 'snapshot',
        runId: this.runId,
        metrics: encodeMetrics(metrics.snapshot()),
        totalUpdates: this.generated,
        timestamp: now,
      });
    }
  }

  private startTimer(): void {
    this.cancelTimer = this.deps.scheduler.every(TICK_MS, () => this.tick());
  }

  private stopTimer(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
  }

  private setStatus(status: WorkerStatus): void {
    this.state = status;
    this.deps.emit({ type: 'status', status });
  }
}
