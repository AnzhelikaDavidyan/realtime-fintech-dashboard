import { WASM_HASH } from '@findev/wasm-hash';

import { producerWasmUrl } from './wasm-url';

describe('producerWasmUrl', () => {
  it('resolves the .wasm under the app base and adds the content hash', () => {
    const url = producerWasmUrl('https://example.test/realtime-fintech-dashboard/', 'abc123');
    expect(url.href).toBe(
      'https://example.test/realtime-fintech-dashboard/wasm/findev_wasm_bg.wasm?v=abc123',
    );
  });

  it('resolves against a worker script URL the same way', () => {
    // A relative URL replaces the last path segment, so the worker file name drops out.
    const url = producerWasmUrl(
      'https://example.test/realtime-fintech-dashboard/worker-ABC.js',
      'abc123',
    );
    expect(url.pathname).toBe('/realtime-fintech-dashboard/wasm/findev_wasm_bg.wasm');
  });

  it('uses the hash generated from the built .wasm by default', () => {
    expect(WASM_HASH).toMatch(/^[0-9a-f]{16}$/);
    expect(producerWasmUrl('https://example.test/').searchParams.get('v')).toBe(WASM_HASH);
  });
});
