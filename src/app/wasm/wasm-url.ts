import { WASM_HASH } from '@findev/wasm-hash';

/** Where the build copies the producer's .wasm, relative to the app's base. */
export const WASM_FILE = 'wasm/findev_wasm_bg.wasm';

/**
 * URL of the producer's .wasm with its content hash as `?v=`. The file name
 * itself never changes, so the hash is what stops a browser from using a
 * stale cached copy after a deploy.
 */
export function producerWasmUrl(base: string | URL, hash: string = WASM_HASH): URL {
  const url = new URL(WASM_FILE, base);
  url.searchParams.set('v', hash);
  return url;
}
