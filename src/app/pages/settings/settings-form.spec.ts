import { DEFAULT_PRODUCER_SETTINGS } from '../../core/producer-settings';
import {
  errorMessage,
  limitsText,
  matchesSettings,
  rangeText,
  settingControl,
} from './settings-form';

describe('settingControl validators', () => {
  const errorsFor = (key: Parameters<typeof settingControl>[0], value: number | null) => {
    const control = settingControl(key, 1);
    control.setValue(value);
    return control.errors;
  };

  it('accepts whole numbers inside the limits', () => {
    expect(errorsFor('instrumentCount', 1)).toBeNull();
    expect(errorsFor('instrumentCount', 50)).toBeNull();
    expect(errorsFor('batchIntervalMs', 2_000)).toBeNull();
  });

  it('requires a value', () => {
    expect(errorsFor('batchIntervalMs', null)).toMatchObject({ required: true });
  });

  it('rejects fractions', () => {
    expect(errorsFor('updatesPerBatch', 12.5)).toMatchObject({ integer: true });
  });

  it('rejects values outside the limits', () => {
    expect(errorsFor('instrumentCount', 0)).toHaveProperty('min');
    expect(errorsFor('instrumentCount', 51)).toHaveProperty('max');
    expect(errorsFor('batchIntervalMs', 49)).toHaveProperty('min');
  });
});

describe('errorMessage', () => {
  it('uses the messages from the design', () => {
    expect(errorMessage('batchIntervalMs', { required: true })).toBe('Required.');
    expect(errorMessage('updatesPerBatch', { integer: true })).toBe('Must be a whole number.');
    expect(errorMessage('instrumentCount', { min: {} })).toBe('Must be between 1 and 50.');
    expect(errorMessage('batchIntervalMs', { max: {} })).toBe('Must be between 50 and 2,000.');
  });

  it('reports the most basic problem first', () => {
    // Several errors at once: the most basic one is shown.
    expect(errorMessage('instrumentCount', { integer: true, min: {} })).toBe(
      'Must be a whole number.',
    );
  });

  it('is null for a valid value', () => {
    expect(errorMessage('instrumentCount', null)).toBeNull();
  });
});

describe('limitsText', () => {
  it('formats the allowed range without a unit', () => {
    expect(limitsText('batchIntervalMs')).toBe('50–2,000');
    expect(limitsText('updatesPerBatch', 'de-DE')).toBe('1–1.000');
  });
});

describe('rangeText', () => {
  it('shows the allowed range, with the unit for the interval', () => {
    expect(rangeText('instrumentCount')).toBe('1–50');
    expect(rangeText('updatesPerBatch')).toBe('1–1,000');
    expect(rangeText('batchIntervalMs')).toBe('ms · 50–2,000');
  });
});

describe('matchesSettings', () => {
  it('compares only the editable fields', () => {
    const value = { instrumentCount: 5, updatesPerBatch: 100, batchIntervalMs: 500 };
    expect(matchesSettings(value, DEFAULT_PRODUCER_SETTINGS)).toBe(true);
    expect(matchesSettings({ ...value, instrumentCount: 6 }, DEFAULT_PRODUCER_SETTINGS)).toBe(
      false,
    );
    // An empty field (null) never matches.
    expect(matchesSettings({ ...value, instrumentCount: null }, DEFAULT_PRODUCER_SETTINGS)).toBe(
      false,
    );
  });
});
