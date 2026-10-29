import { Component, inject, input, LOCALE_ID } from '@angular/core';

import { EditableKey, limitsText } from '../settings-form';

/** Side panel of the settings page: the active run, what Apply does, and the allowed values. */
@Component({
  selector: 'app-settings-help',
  templateUrl: './settings-help.html',
  styleUrl: './settings-help.scss',
})
export class SettingsHelp {
  private readonly locale = inject(LOCALE_ID);

  /** "Run #3 · 5 instruments · 100 updates every 500 ms". */
  readonly activeRun = input.required<string>();
  /** Briefly highlights the active run after it was started from Apply. */
  readonly justApplied = input(false);

  protected readonly allowedValues = (() => {
    const range = (key: EditableKey) => limitsText(key, this.locale);
    return `Whole numbers only. Instruments ${range('instrumentCount')} · Updates ${range('updatesPerBatch')} · Interval ${range('batchIntervalMs')} ms`;
  })();
}
