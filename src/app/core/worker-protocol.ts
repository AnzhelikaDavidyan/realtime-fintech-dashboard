import type { InstrumentMetrics } from './instrument-metrics';
import type { ProducerSettings } from './producer-settings';

/** Lifecycle of the producer worker. */
export type WorkerStatus = 'idle' | 'running' | 'paused' | 'finished';

/** Messages the UI sends to the worker. */
export type WorkerCommand =
  | { readonly type: 'init'; readonly settings: ProducerSettings }
  | { readonly type: 'start' }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'finish' };

/** Messages the worker sends to the UI. */
export type WorkerEvent =
  | { readonly type: 'ready'; readonly producerVersion: string }
  | {
      readonly type: 'snapshot';
      /** Run the snapshot belongs to, so late snapshots from a previous run can be ignored. */
      readonly runId: number;
      readonly metrics: readonly InstrumentMetrics[];
      /** Updates generated since the run started. */
      readonly totalUpdates: number;
      /** `performance.now()` in the worker when the snapshot was taken. */
      readonly timestamp: number;
    }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'status'; readonly status: WorkerStatus };

export type WorkerCommandType = WorkerCommand['type'];
export type WorkerEventType = WorkerEvent['type'];
