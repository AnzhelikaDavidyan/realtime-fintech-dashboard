/** Settings for the market data producer running in the worker. */
export interface ProducerSettings {
  /** PRNG seed; the same seed replays the same market. */
  readonly seed: number;
  /** Number of simulated instruments. */
  readonly instruments: number;
  /** Target market updates generated per second. */
  readonly updatesPerSecond: number;
  /** How often the worker posts a metrics snapshot to the UI, in milliseconds. */
  readonly snapshotIntervalMs: number;
}

export interface Range {
  readonly min: number;
  readonly max: number;
}

export const PRODUCER_SETTINGS_LIMITS: Readonly<Record<keyof ProducerSettings, Range>> = {
  seed: { min: 0, max: Number.MAX_SAFE_INTEGER },
  instruments: { min: 1, max: 100 },
  updatesPerSecond: { min: 1, max: 100_000 },
  snapshotIntervalMs: { min: 50, max: 5_000 },
};

export const DEFAULT_PRODUCER_SETTINGS: ProducerSettings = {
  seed: 42,
  instruments: 10,
  updatesPerSecond: 1_000,
  snapshotIntervalMs: 250,
};

/**
 * Fills missing values with defaults, rounds to integers and clamps each value
 * into its limits. Non-finite values (NaN, Infinity) fall back to the default.
 */
export function normalizeProducerSettings(input: Partial<ProducerSettings> = {}): ProducerSettings {
  return {
    seed: normalizeField(input, 'seed'),
    instruments: normalizeField(input, 'instruments'),
    updatesPerSecond: normalizeField(input, 'updatesPerSecond'),
    snapshotIntervalMs: normalizeField(input, 'snapshotIntervalMs'),
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
