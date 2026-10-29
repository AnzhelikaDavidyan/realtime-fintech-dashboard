import {
  DEFAULT_PRODUCER_SETTINGS,
  nominalRate,
  normalizeProducerSettings,
  PRODUCER_SETTINGS_LIMITS,
  ProducerSettings,
} from './producer-settings';

describe('producer settings', () => {
  it('has the defaults from the design: 5 instruments, 100 updates every 500 ms', () => {
    expect(DEFAULT_PRODUCER_SETTINGS).toMatchObject({
      instrumentCount: 5,
      updatesPerBatch: 100,
      batchIntervalMs: 500,
    });
  });

  it('has the limits from the design', () => {
    expect(PRODUCER_SETTINGS_LIMITS.instrumentCount).toEqual({ min: 1, max: 50 });
    expect(PRODUCER_SETTINGS_LIMITS.updatesPerBatch).toEqual({ min: 1, max: 1_000 });
    expect(PRODUCER_SETTINGS_LIMITS.batchIntervalMs).toEqual({ min: 50, max: 2_000 });
  });

  it('has defaults that are inside the limits', () => {
    for (const key of Object.keys(DEFAULT_PRODUCER_SETTINGS) as (keyof ProducerSettings)[]) {
      const { min, max } = PRODUCER_SETTINGS_LIMITS[key];
      expect(DEFAULT_PRODUCER_SETTINGS[key]).toBeGreaterThanOrEqual(min);
      expect(DEFAULT_PRODUCER_SETTINGS[key]).toBeLessThanOrEqual(max);
    }
  });
});

describe('nominalRate', () => {
  it('is batch size × 1000 / interval (design: 100 × 1000 / 500 = 200)', () => {
    expect(nominalRate(DEFAULT_PRODUCER_SETTINGS)).toBe(200);
    expect(
      nominalRate({ ...DEFAULT_PRODUCER_SETTINGS, updatesPerBatch: 1_000, batchIntervalMs: 50 }),
    ).toBe(20_000);
  });
});

describe('normalizeProducerSettings', () => {
  it('returns the defaults when nothing is given', () => {
    expect(normalizeProducerSettings()).toEqual(DEFAULT_PRODUCER_SETTINGS);
    expect(normalizeProducerSettings({})).toEqual(DEFAULT_PRODUCER_SETTINGS);
  });

  it('keeps valid values and fills the rest with defaults', () => {
    expect(normalizeProducerSettings({ seed: 7, instrumentCount: 25 })).toEqual({
      ...DEFAULT_PRODUCER_SETTINGS,
      seed: 7,
      instrumentCount: 25,
    });
  });

  it('clamps values into their limits', () => {
    const { instrumentCount, updatesPerBatch, batchIntervalMs } = PRODUCER_SETTINGS_LIMITS;
    expect(
      normalizeProducerSettings({ instrumentCount: 0, updatesPerBatch: 1e9, batchIntervalMs: 1 }),
    ).toEqual({
      ...DEFAULT_PRODUCER_SETTINGS,
      instrumentCount: instrumentCount.min,
      updatesPerBatch: updatesPerBatch.max,
      batchIntervalMs: batchIntervalMs.min,
    });
    // The seed's minimum is 0, so a negative seed clamps to 0.
    expect(normalizeProducerSettings({ seed: -5 }).seed).toBe(0);
  });

  it('rounds to whole numbers', () => {
    expect(
      normalizeProducerSettings({ instrumentCount: 3.6, updatesPerBatch: 99.4 }),
    ).toMatchObject({
      instrumentCount: 4,
      updatesPerBatch: 99,
    });
  });

  it('falls back to the default for non-finite values', () => {
    // Infinity falls back to the default; it is not clamped to the max.
    expect(
      normalizeProducerSettings({ seed: Number.NaN, instrumentCount: Number.POSITIVE_INFINITY }),
    ).toEqual(DEFAULT_PRODUCER_SETTINGS);
  });
});
