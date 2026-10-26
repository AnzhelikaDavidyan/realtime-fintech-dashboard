import type { ProducerSettings } from './producer-settings';

/** Lifecycle of the producer worker. */
export type WorkerStatus = 'idle' | 'running' | 'paused' | 'finished';

/**
 * Messages the UI sends to the worker.
 *
 * `init` stores settings; `start` begins a fresh run with them under `runId`.
 * Commands sent before the Wasm module is loaded are queued and run once it is.
 */
export type WorkerCommand =
  | { readonly type: 'init'; readonly settings: Partial<ProducerSettings> }
  | { readonly type: 'start'; readonly runId: number }
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
      /**
       * Metrics for every instrument, packed with `encodeMetrics` (see metrics-codec.ts).
       * Its buffer is transferred, not copied; read it with `decodeMetrics`.
       */
      readonly metrics: Float64Array;
      /** Updates generated since the run started. */
      readonly totalUpdates: number;
      /** `performance.now()` in the worker when the snapshot was taken. */
      readonly timestamp: number;
    }
  | {
      readonly type: 'error';
      readonly message: string;
      /** Command that failed, when the error came from handling one. */
      readonly command?: WorkerCommandType;
    }
  | { readonly type: 'status'; readonly status: WorkerStatus };

export type WorkerCommandType = WorkerCommand['type'];
export type WorkerEventType = WorkerEvent['type'];
