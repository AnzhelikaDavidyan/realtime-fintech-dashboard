import { loadProducerWasm } from './load-producer-wasm';

const url = new URL('https://example.test/app/wasm/findev_wasm_bg.wasm');

describe('loadProducerWasm', () => {
  it('explains a failed download', async () => {
    const fetchFn = () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(loadProducerWasm(url, fetchFn as typeof fetch)).rejects.toThrow(
      'Could not download the market engine (/app/wasm/findev_wasm_bg.wasm): Failed to fetch',
    );
  });

  it('explains an HTTP error status', async () => {
    const fetchFn = () =>
      Promise.resolve(new Response('missing', { status: 404, statusText: 'Not Found' }));
    await expect(loadProducerWasm(url, fetchFn as typeof fetch)).rejects.toThrow(
      'Could not download the market engine (/app/wasm/findev_wasm_bg.wasm): server answered 404 Not Found',
    );
  });

  it('explains a file that is not valid WebAssembly', async () => {
    const fetchFn = () =>
      Promise.resolve(
        // A missing file often comes back as the app's index.html with status 200, so the status check is not enough.
        new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
      );
    await expect(loadProducerWasm(url, fetchFn as typeof fetch)).rejects.toThrow(
      /^The market engine \(\/app\/wasm\/findev_wasm_bg\.wasm\) could not start: /,
    );
  });
});
