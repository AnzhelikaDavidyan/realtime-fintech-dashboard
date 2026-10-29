import { ProducerSettings } from '../core/producer-settings';
import { WorkerCommand, WorkerCommandType, WorkerEvent } from '../core/worker-protocol';
import { ProducerWasm } from './load-producer-wasm';
import { Clock, ProducerEngine, Scheduler } from './producer-engine';

/** Set by Angular: undefined or truthy in dev, replaced with false in production builds. */
declare const ngDevMode: unknown;

/** The part of the worker global scope the host needs. */
export interface WorkerPort {
  postMessage(message: WorkerEvent, transfer: Transferable[]): void;
}

export interface ProducerWorkerHostDeps {
  readonly port: WorkerPort;
  readonly loadWasm: () => Promise<ProducerWasm>;
  readonly scheduler: Scheduler;
  readonly clock: Clock;
}

interface SnapshotPause {
  readonly at: number;
  readonly runId: number;
  readonly totalUpdates: number;
}

const COMMAND_TYPES: ReadonlySet<string> = new Set<WorkerCommandType>([
  'init',
  'start',
  'pause',
  'resume',
  'finish',
  'pause-snapshots',
  'resume-snapshots',
]);

/**
 * Worker-side glue: loads the Wasm producer, posts `ready` or a readable
 * `error`, routes commands to the engine and posts its events back,
 * transferring snapshot buffers instead of copying them.
 */
export class ProducerWorkerHost {
  /** Settles once loading has finished, successfully or not. */
  readonly loaded: Promise<void>;
  private engine: ProducerEngine | null = null;
  private loadError: string | null = null;
  private settings: Partial<ProducerSettings> = {};
  private queued: WorkerCommand[] = [];
  /** Engine state when snapshots were paused, for the dev log on resume. */
  private snapshotsPausedAt: SnapshotPause | null = null;
  private snapshotsPosted = 0;

  constructor(private readonly deps: ProducerWorkerHostDeps) {
    this.loaded = this.load();
  }

  /** Handles one message from the UI. */
  receive(data: unknown): void {
    logMessage('worker received from Angular', data);
    if (!isWorkerCommand(data)) {
      this.post({ type: 'error', message: `Unknown command: ${JSON.stringify(data)}` });
      return;
    }
    if (this.loadError !== null) {
      this.post({
        type: 'error',
        message: `The market engine is unavailable: ${this.loadError}`,
        command: data.type,
      });
      return;
    }
    if (!this.engine) {
      this.queued.push(data);
      return;
    }
    this.handle(this.engine, data);
  }

  private async load(): Promise<void> {
    try {
      const wasm = await this.deps.loadWasm();
      const engine = new ProducerEngine({
        createGenerator: wasm.createGenerator,
        scheduler: this.deps.scheduler,
        clock: this.deps.clock,
        emit: (event) => this.post(event),
      });
      this.engine = engine;
      this.post({ type: 'ready', producerVersion: wasm.version });
      for (const command of this.drainQueue()) {
        this.handle(engine, command);
      }
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error);
      this.post({ type: 'error', message: this.loadError });
      for (const command of this.drainQueue()) {
        this.receive(command);
      }
    }
  }

  private handle(engine: ProducerEngine, command: WorkerCommand): void {
    try {
      switch (command.type) {
        case 'init':
          this.settings = command.settings;
          break;
        case 'start':
          engine.start(command.runId, this.settings);
          break;
        case 'pause':
          engine.pause();
          break;
        case 'resume':
          engine.resume();
          break;
        case 'finish':
          engine.finish();
          break;
        case 'pause-snapshots':
          engine.pauseSnapshots();
          this.snapshotsPaused(engine);
          break;
        case 'resume-snapshots': {
          const posted = this.snapshotsPosted;
          engine.resumeSnapshots();
          this.snapshotsResumed(engine, this.snapshotsPosted > posted);
          break;
        }
      }
    } catch (error) {
      this.post({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        command: command.type,
      });
    }
  }

  private snapshotsPaused(engine: ProducerEngine): void {
    // A repeated pause keeps the first one, so the summary covers the whole hidden time.
    this.snapshotsPausedAt ??= {
      at: this.deps.clock(),
      runId: engine.currentRunId,
      totalUpdates: engine.totalUpdates,
    };
    logMessage('worker snapshots', {
      type: 'snapshots-paused',
      status: engine.status,
      runId: engine.currentRunId,
      totalUpdates: engine.totalUpdates,
      note: 'generation goes on, nothing is posted',
    });
  }

  private snapshotsResumed(engine: ProducerEngine, catchUpSent: boolean): void {
    const paused = this.snapshotsPausedAt;
    this.snapshotsPausedAt = null;
    if (!paused) {
      return;
    }
    const sameRun = paused.runId === engine.currentRunId;
    logMessage('worker snapshots', {
      type: 'snapshots-resumed',
      status: engine.status,
      runId: engine.currentRunId,
      pausedForMs: Math.round(this.deps.clock() - paused.at),
      generatedWhilePaused: sameRun
        ? engine.totalUpdates - paused.totalUpdates
        : `new run started while paused (now ${engine.totalUpdates})`,
      catchUpSnapshotSent: catchUpSent,
    });
  }

  private drainQueue(): WorkerCommand[] {
    const commands = this.queued;
    this.queued = [];
    return commands;
  }

  private post(event: WorkerEvent): void {
    logMessage('worker sending to Angular', event);
    const transfer: Transferable[] = [];
    if (event.type === 'snapshot') {
      this.snapshotsPosted++;
      transfer.push(event.metrics.buffer);
    }
    this.deps.port.postMessage(event, transfer);
  }
}

/**
 * Debug log of one message on the worker side, headed by its type. Dev builds only.
 * Snapshot metrics are summarised: the buffer is transferred right after, so a logged
 * array would show up empty when expanded.
 */
function logMessage(direction: string, message: unknown): void {
  if (typeof ngDevMode !== 'undefined' && !ngDevMode) {
    return;
  }
  const { type = 'unknown', ...fields } =
    typeof message === 'object' && message !== null ? (message as Record<string, unknown>) : {};
  if (fields['metrics'] instanceof Float64Array) {
    fields['metrics'] = `${fields['metrics'].length} numbers`;
  }
  console.log(`__________________${String(type)}__________________`, direction, fields);
}

function isWorkerCommand(data: unknown): data is WorkerCommand {
  if (typeof data !== 'object' || data === null || !('type' in data)) {
    return false;
  }
  const { type } = data;
  if (typeof type !== 'string' || !COMMAND_TYPES.has(type)) {
    return false;
  }
  if (type === 'start') {
    return 'runId' in data && typeof data.runId === 'number';
  }
  if (type === 'init') {
    return 'settings' in data && typeof data.settings === 'object' && data.settings !== null;
  }
  return true;
}
