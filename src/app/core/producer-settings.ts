/** Settings for the market data producer running in the worker. */
export interface ProducerSettings {
  /** PRNG seed; the same seed replays the same market. */
  readonly seed: number;
  /** Number of simulated instruments (a count, not a list). */
  readonly instrumentCount: number;
  /** Updates generated per batch, across all instruments. */
  readonly updatesPerBatch: number;
  /** Requested time between batches, in milliseconds. */
  readonly batchIntervalMs: number;
}

export interface Range {
  readonly min: number;
  readonly max: number;
}

export const PRODUCER_SETTINGS_LIMITS: Readonly<Record<keyof ProducerSettings, Range>> = {
  seed: { min: 0, max: Number.MAX_SAFE_INTEGER },
  instrumentCount: { min: 1, max: 50 },
  updatesPerBatch: { min: 1, max: 1_000 },
  batchIntervalMs: { min: 50, max: 2_000 },
};

export const DEFAULT_PRODUCER_SETTINGS: ProducerSettings = {
  seed: 42,
  instrumentCount: 5,
  updatesPerBatch: 100,
  batchIntervalMs: 500,
};

/** Updates per second the settings ask for: batch size × 1000 / interval. */
export function nominalRate({ updatesPerBatch, batchIntervalMs }: ProducerSettings): number {
  return (updatesPerBatch * 1_000) / batchIntervalMs;
}

/**
 * Fills missing values with defaults, rounds to integers and clamps each value
 * into its limits. Non-finite values (NaN, Infinity) fall back to the default.
 */
export function normalizeProducerSettings(input: Partial<ProducerSettings> = {}): ProducerSettings {
  return {
    seed: normalizeField(input, 'seed'),
    instrumentCount: normalizeField(input, 'instrumentCount'),
    updatesPerBatch: normalizeField(input, 'updatesPerBatch'),
    batchIntervalMs: normalizeField(input, 'batchIntervalMs'),
  };
}

function normalizeField(input: Partial<ProducerSettings>, key: keyof ProducerSettings): number {
  const value = input[key];
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_PRODUCER_SETTINGS[key];
  }
  const { min, max } = PRODUCER_SETTINGS_LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(value)));
}
