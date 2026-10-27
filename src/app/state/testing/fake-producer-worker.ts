import { Provider } from '@angular/core';

import { WorkerCommand, WorkerEvent } from '../../core/worker-protocol';
import { PRODUCER_WORKER_FACTORY, ProducerWorker } from '../producer.service';

/**
 * Stand-in for the producer Web Worker in tests (jsdom has no `Worker`).
 * Records the commands it receives and lets a test play the worker's side.
 */
export class FakeProducerWorker implements ProducerWorker {
  onmessage: ((event: MessageEvent<WorkerEvent>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly sent: WorkerCommand[] = [];
  terminated = false;

  postMessage(command: WorkerCommand): void {
    this.sent.push(command);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Delivers an event as if the worker had posted it. */
  emit(event: WorkerEvent): void {
    this.onmessage?.(new MessageEvent('message', { data: event }));
  }

  /** Simulates the worker script failing. */
  crash(message: string): void {
    this.onerror?.(new ErrorEvent('error', { message }));
  }
}

/**
 * Makes `ProducerService` use fake workers. Any test that renders something
 * injecting the service needs this. Pass an array to inspect the workers created.
 */
export function provideFakeProducerWorker(created: FakeProducerWorker[] = []): Provider {
  return {
    provide: PRODUCER_WORKER_FACTORY,
    useValue: () => {
      const worker = new FakeProducerWorker();
      created.push(worker);
      return worker;
    },
  };
}
