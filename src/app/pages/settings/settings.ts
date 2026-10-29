import { Component, computed, inject, LOCALE_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

import { DEFAULT_PRODUCER_SETTINGS, nominalRate } from '../../core/producer-settings';
import { ProducerService } from '../../state/producer.service';
import { formatVolume } from '../../ui/format/formatters';
import { SettingsActions } from './settings-actions/settings-actions';
import { SettingsApply } from './settings-apply';
import {
  ApplyState,
  describeRun,
  EDITABLE_KEYS,
  EditableKey,
  errorMessage,
  matchesSettings,
  rangeText,
  settingControl,
  SettingsFormValue,
} from './settings-form';
import { SettingsHelp } from './settings-help/settings-help';

interface FieldView {
  readonly key: EditableKey;
  readonly label: string;
  readonly hint: string;
  readonly range: string;
}

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, SettingsActions, SettingsHelp],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  private readonly producer = inject(ProducerService);
  private readonly locale = inject(LOCALE_ID);
  private readonly applyService = inject(SettingsApply);

  protected readonly runId = this.producer.runId;
  protected readonly active = this.producer.activeSettings;
  protected readonly applying = this.applyService.applying;
  protected readonly justApplied = this.applyService.justApplied;

  /** Typed form, starting from the settings of the active run. */
  protected readonly form = new FormGroup({
    instrumentCount: settingControl('instrumentCount', this.active().instrumentCount),
    updatesPerBatch: settingControl('updatesPerBatch', this.active().updatesPerBatch),
    batchIntervalMs: settingControl('batchIntervalMs', this.active().batchIntervalMs),
  });

  protected readonly fields: readonly FieldView[] = [
    {
      key: 'instrumentCount',
      label: 'Instrument count',
      hint: 'How many fictional instruments to simulate',
      range: rangeText('instrumentCount', this.locale),
    },
    {
      key: 'updatesPerBatch',
      label: 'Updates per batch',
      hint: 'Total updates per batch, across all instruments',
      range: rangeText('updatesPerBatch', this.locale),
    },
    {
      key: 'batchIntervalMs',
      label: 'Batch interval',
      hint: 'Requested time between batches',
      range: rangeText('batchIntervalMs', this.locale),
    },
  ];

  /** Any form change (value, validity, touched): drives everything below. */
  private readonly formEvents = toSignal(this.form.events);
  private readonly value = computed<SettingsFormValue>(() => {
    this.formEvents();
    return this.form.getRawValue();
  });
  protected readonly valid = computed(() => {
    this.formEvents();
    return this.form.valid;
  });

  /**
   * Error message per field. The form starts from the active run's settings, which are
   * always valid, so a field can only become invalid by being edited.
   */
  protected readonly errors = computed<Record<EditableKey, string | null>>(() => {
    this.formEvents();
    const entries = EDITABLE_KEYS.map((key) => {
      const control = this.form.controls[key];
      return [key, errorMessage(key, control.errors, this.locale)] as const;
    });
    return Object.fromEntries(entries) as Record<EditableKey, string | null>;
  });

  /** Fields whose value differs from the active run (shown with a blue border). */
  protected readonly changed = computed<Record<EditableKey, boolean>>(() => {
    const value = this.value();
    const active = this.active();
    const entries = EDITABLE_KEYS.map((key) => [key, value[key] !== active[key]] as const);
    return Object.fromEntries(entries) as Record<EditableKey, boolean>;
  });

  /** Drives the actions row: its note, the Apply tooltip and whether Apply is available. */
  protected readonly applyState = computed<ApplyState>(() => {
    if (this.applying()) return 'applying';
    if (!this.valid()) return 'invalid';
    return matchesSettings(this.value(), this.active()) ? 'unchanged' : 'ready';
  });

  /** "200 updates / second … (100 × 1000 / 500)", or null while a field is invalid. */
  protected readonly rate = computed(() => {
    if (!this.valid()) return null;
    const { updatesPerBatch, batchIntervalMs } = this.value();
    const settings = {
      ...this.active(),
      updatesPerBatch: updatesPerBatch!,
      batchIntervalMs: batchIntervalMs!,
    };
    return {
      perSecond: formatVolume(nominalRate(settings), { locale: this.locale }),
      formula: `${updatesPerBatch} × 1000 / ${batchIntervalMs}`,
    };
  });

  /** "Run #3 · 5 instruments · 100 updates every 500 ms". */
  protected readonly activeRun = computed(() =>
    describeRun(this.runId(), this.active(), this.locale),
  );

  protected apply(): void {
    if (this.applyState() !== 'ready') return;
    const { instrumentCount, updatesPerBatch, batchIntervalMs } = this.form.getRawValue();
    this.applyService.apply({
      ...this.active(),
      instrumentCount: instrumentCount!,
      updatesPerBatch: updatesPerBatch!,
      batchIntervalMs: batchIntervalMs!,
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  protected resetToDefaults(): void {
    this.form.setValue({
      instrumentCount: DEFAULT_PRODUCER_SETTINGS.instrumentCount,
      updatesPerBatch: DEFAULT_PRODUCER_SETTINGS.updatesPerBatch,
      batchIntervalMs: DEFAULT_PRODUCER_SETTINGS.batchIntervalMs,
    });
    this.form.markAsDirty();
  }
}
