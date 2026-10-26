import {
  DEFAULT_PRODUCER_SETTINGS,
  normalizeProducerSettings,
  PRODUCER_SETTINGS_LIMITS,
  ProducerSettings,
} from './producer-settings';

describe('normalizeProducerSettings', () => {
  it('returns the defaults when nothing is given', () => {
    expect(normalizeProducerSettings()).toEqual(DEFAULT_PRODUCER_SETTINGS);
    expect(normalizeProducerSettings({})).toEqual(DEFAULT_PRODUCER_SETTINGS);
  });

  it('keeps valid values and fills the rest with defaults', () => {
    expect(normalizeProducerSettings({ seed: 7, instruments: 25 })).toEqual({
      ...DEFAULT_PRODUCER_SETTINGS,
      seed: 7,
      instruments: 25,
    });
  });

  it('clamps values into their limits', () => {
    const { instruments, updatesPerSecond, snapshotIntervalMs } = PRODUCER_SETTINGS_LIMITS;
    expect(
      normalizeProducerSettings({ instruments: 0, updatesPerSecond: 1e9, snapshotIntervalMs: 1 }),
    ).toEqual({
      ...DEFAULT_PRODUCER_SETTINGS,
      instruments: instruments.min,
      updatesPerSecond: updatesPerSecond.max,
      snapshotIntervalMs: snapshotIntervalMs.min,
    });
    expect(normalizeProducerSettings({ seed: -5 }).seed).toBe(0);
  });

  it('rounds to whole numbers', () => {
    expect(normalizeProducerSettings({ instruments: 3.6, updatesPerSecond: 99.4 })).toMatchObject({
      instruments: 4,
      updatesPerSecond: 99,
    });
  });

  it('falls back to the default for non-finite values', () => {
    expect(
      normalizeProducerSettings({ seed: Number.NaN, instruments: Number.POSITIVE_INFINITY }),
    ).toEqual(DEFAULT_PRODUCER_SETTINGS);
  });

  it('has defaults that are inside the limits', () => {
    for (const key of Object.keys(DEFAULT_PRODUCER_SETTINGS) as (keyof ProducerSettings)[]) {
      const { min, max } = PRODUCER_SETTINGS_LIMITS[key];
      expect(DEFAULT_PRODUCER_SETTINGS[key]).toBeGreaterThanOrEqual(min);
      expect(DEFAULT_PRODUCER_SETTINGS[key]).toBeLessThanOrEqual(max);
    }
  });
});
