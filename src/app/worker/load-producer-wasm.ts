import init, { MarketGenerator, version } from '@findev/wasm';

import { GeneratorFactory } from './producer-engine';

export interface ProducerWasm {
  readonly version: string;
  readonly createGenerator: GeneratorFactory;
}

/**
 * Downloads and starts the Wasm producer. Failures are rethrown as messages a
 * person can act on, instead of the raw fetch / WebAssembly errors.
 */
export async function loadProducerWasm(
  url: URL,
  fetchFn: typeof fetch = fetch,
): Promise<ProducerWasm> {
  const where = url.pathname;
  let response: Response;
  try {
    response = await fetchFn(url);
  } catch (error) {
    throw new Error(`Could not download the market engine (${where}): ${describe(error)}`, {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new Error(
      `Could not download the market engine (${where}): server answered ${response.status} ${response.statusText}`.trim(),
    );
  }
  try {
    await init({ module_or_path: response });
  } catch (error) {
    throw new Error(`The market engine (${where}) could not start: ${describe(error)}`, {
      cause: error,
    });
  }
  return {
    version: version(),
    createGenerator: (seed, instrumentCount) => new MarketGenerator(BigInt(seed), instrumentCount),
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
