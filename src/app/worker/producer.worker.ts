/// <reference lib="webworker" />

import { loadProducerWasm } from './load-producer-wasm';
import { ProducerWorkerHost } from './producer-worker-host';

// The build copies the .wasm next to the app; resolving against the worker
// script keeps it working under a base path such as GitHub Pages.
const wasmUrl = new URL('wasm/findev_wasm_bg.wasm', self.location.href);

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
