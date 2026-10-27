import { DEFAULT_PRODUCER_SETTINGS } from '../../core/producer-settings';
import { errorMessage, matchesSettings, rangeText, settingControl } from './settings-form';

describe('settingControl validators', () => {
  const errorsFor = (key: Parameters<typeof settingControl>[0], value: number | null) => {
    const control = settingControl(key, 1);
    control.setValue(value);
    return control.errors;
  };

  it('accepts whole numbers inside the limits', () => {
    expect(errorsFor('instruments', 1)).toBeNull();
    expect(errorsFor('instruments', 50)).toBeNull();
    expect(errorsFor('batchIntervalMs', 2_000)).toBeNull();
  });

  it('requires a value', () => {
    expect(errorsFor('batchIntervalMs', null)).toMatchObject({ required: true });
  });

  it('rejects fractions', () => {
    expect(errorsFor('updatesPerBatch', 12.5)).toMatchObject({ integer: true });
  });

  it('rejects values outside the limits', () => {
    expect(errorsFor('instruments', 0)).toHaveProperty('min');
    expect(errorsFor('instruments', 51)).toHaveProperty('max');
    expect(errorsFor('batchIntervalMs', 49)).toHaveProperty('min');
  });
});

describe('errorMessage', () => {
  it('uses the messages from the design', () => {
    expect(errorMessage('batchIntervalMs', { required: true })).toBe('Required.');
    expect(errorMessage('updatesPerBatch', { integer: true })).toBe('Must be a whole number.');
    expect(errorMessage('instruments', { min: {} })).toBe('Must be between 1 and 50.');
    expect(errorMessage('batchIntervalMs', { max: {} })).toBe('Must be between 50 and 2,000.');
  });

  it('reports the most basic problem first', () => {
    expect(errorMessage('instruments', { integer: true, min: {} })).toBe('Must be a whole number.');
  });

  it('is null for a valid value', () => {
    expect(errorMessage('instruments', null)).toBeNull();
  });
});

describe('rangeText', () => {
  it('shows the allowed range, with the unit for the interval', () => {
    expect(rangeText('instruments')).toBe('1–50');
    expect(rangeText('updatesPerBatch')).toBe('1–1,000');
    expect(rangeText('batchIntervalMs')).toBe('ms · 50–2,000');
  });
});

describe('matchesSettings', () => {
  it('compares only the editable fields', () => {
    const value = { instruments: 5, updatesPerBatch: 100, batchIntervalMs: 500 };
    expect(matchesSettings(value, DEFAULT_PRODUCER_SETTINGS)).toBe(true);
    expect(matchesSettings({ ...value, instruments: 6 }, DEFAULT_PRODUCER_SETTINGS)).toBe(false);
    expect(matchesSettings({ ...value, instruments: null }, DEFAULT_PRODUCER_SETTINGS)).toBe(false);
  });
});
