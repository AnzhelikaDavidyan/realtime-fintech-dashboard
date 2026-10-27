import { AbstractControl, FormControl, ValidationErrors, Validators } from '@angular/forms';

import { PRODUCER_SETTINGS_LIMITS, ProducerSettings } from '../../core/producer-settings';
import { formatVolume } from '../../ui/format/formatters';

/** The settings a person can edit (the seed stays as it is). */
export type EditableKey = 'instruments' | 'updatesPerBatch' | 'batchIntervalMs';

export const EDITABLE_KEYS: readonly EditableKey[] = [
  'instruments',
  'updatesPerBatch',
  'batchIntervalMs',
];

/** `null` means the field is empty. */
export type SettingsFormValue = Record<EditableKey, number | null>;

/** Fails for anything that is not a whole number; empty is left to `required`. */
export function integerValidator(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  return value === null || Number.isInteger(value) ? null : { integer: true };
}

/** Required, whole number and within the limits for that setting. */
export function settingControl(key: EditableKey, value: number): FormControl<number | null> {
  const { min, max } = PRODUCER_SETTINGS_LIMITS[key];
  return new FormControl<number | null>(value, [
    Validators.required,
    integerValidator,
    Validators.min(min),
    Validators.max(max),
  ]);
}

/** Message for the first problem with a value, in the order a person would fix it. */
export function errorMessage(
  key: EditableKey,
  errors: ValidationErrors | null,
  locale?: string,
): string | null {
  if (!errors) return null;
  if (errors['required']) return 'Required.';
  if (errors['integer']) return 'Must be a whole number.';
  if (errors['min'] || errors['max']) {
    const { min, max } = PRODUCER_SETTINGS_LIMITS[key];
    return `Must be between ${formatVolume(min, { locale })} and ${formatVolume(max, { locale })}.`;
  }
  return 'Invalid value.';
}

/** Range shown inside each input, e.g. "1–50" or "ms · 50–2,000". */
export function rangeText(key: EditableKey, locale?: string): string {
  const { min, max } = PRODUCER_SETTINGS_LIMITS[key];
  const range = `${formatVolume(min, { locale })}–${formatVolume(max, { locale })}`;
  return key === 'batchIntervalMs' ? `ms · ${range}` : range;
}

/** True when every editable field equals the given settings. */
export function matchesSettings(value: SettingsFormValue, settings: ProducerSettings): boolean {
  return EDITABLE_KEYS.every((key) => value[key] === settings[key]);
}

/** "Run #3 · 5 instruments · 100 updates every 500 ms". */
export function describeRun(runId: number, settings: ProducerSettings, locale?: string): string {
  const { instruments, updatesPerBatch, batchIntervalMs } = settings;
  const n = (value: number) => formatVolume(value, { locale });
  const noun = instruments === 1 ? 'instrument' : 'instruments';
  return `Run #${runId} · ${n(instruments)} ${noun} · ${n(updatesPerBatch)} updates every ${n(batchIntervalMs)} ms`;
}
