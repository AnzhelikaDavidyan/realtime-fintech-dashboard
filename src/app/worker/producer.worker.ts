/// <reference lib="webworker" />

import { producerWasmUrl } from '../wasm/wasm-url';
import { loadProducerWasm } from './load-producer-wasm';
import { ProducerWorkerHost } from './producer-worker-host';

// Resolving against the worker script keeps it working under a base path such
// as GitHub Pages; the content hash keeps browsers from using a stale .wasm.
const wasmUrl = producerWasmUrl(self.location.href);

const host = new ProducerWorkerHost({
  port: { postMessage: (message, transfer) => self.postMessage(message, transfer) },
  loadWasm: () => loadProducerWasm(wasmUrl),
  scheduler: {
    every: (intervalMs, callback) => {
      const id = setInterval(callback, intervalMs);
      return () => clearInterval(id);
    },
  },
  clock: () => performance.now(),
});

addEventListener('message', ({ data }: MessageEvent<unknown>) => host.receive(data));
