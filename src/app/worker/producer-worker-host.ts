import { ProducerSettings } from '../core/producer-settings';
import { WorkerCommand, WorkerCommandType, WorkerEvent } from '../core/worker-protocol';
import { ProducerWasm } from './load-producer-wasm';
import { Clock, ProducerEngine, Scheduler } from './producer-engine';

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

const COMMAND_TYPES: ReadonlySet<string> = new Set<WorkerCommandType>([
  'init',
  'start',
  'pause',
  'resume',
  'finish',
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

  constructor(private readonly deps: ProducerWorkerHostDeps) {
    this.loaded = this.load();
  }

  /** Handles one message from the UI. */
  receive(data: unknown): void {
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
      }
    } catch (error) {
      this.post({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        command: command.type,
      });
    }
  }

  private drainQueue(): WorkerCommand[] {
    const commands = this.queued;
    this.queued = [];
    return commands;
  }

  private post(event: WorkerEvent): void {
    const transfer = event.type === 'snapshot' ? [event.metrics.buffer] : [];
    this.deps.port.postMessage(event, transfer);
  }
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
