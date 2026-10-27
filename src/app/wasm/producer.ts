import init, { version } from '@findev/wasm';

import { producerWasmUrl } from './wasm-url';

export interface Producer {
  version(): string;
}

let ready: Promise<Producer> | undefined;

/**
 * Loads the Wasm producer once and reuses it. The .wasm file is copied to
 * `wasm/` by the build, so it resolves against the app's base href.
 */
export function loadProducer(): Promise<Producer> {
  ready ??= init({ module_or_path: producerWasmUrl(document.baseURI) })
    .then(() => ({ version }))
    .catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
  return ready;
}
