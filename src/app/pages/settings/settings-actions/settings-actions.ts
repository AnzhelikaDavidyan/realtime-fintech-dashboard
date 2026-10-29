import { Component, computed, input, output } from '@angular/core';

import { Tooltip } from '../../../ui/tooltip/tooltip';
import { ApplyState } from '../settings-form';

const NOTES: Record<ApplyState, string> = {
  applying: 'Applying settings: starting a new run…',
  invalid: 'Apply is disabled until every field is valid. The running producer is not affected.',
  unchanged: 'Form matches the active run — nothing to apply yet.',
  ready: 'Apply resets all totals and starts a new run (it also resumes if paused).',
};

const TOOLTIPS: Record<ApplyState, string> = {
  applying: 'Starting the new run…',
  invalid: 'Fix the highlighted fields to apply.',
  unchanged: 'Nothing to apply yet. Change a value to enable Apply.',
  ready: 'Restarts the producer with these settings. All totals reset to zero.',
};

/**
 * Bottom row of the settings form: a note on what Apply will do, Reset to
 * defaults, and Apply. Apply is a submit button, so the enclosing form
 * handles it; this component only reports Reset to defaults.
 */
@Component({
  selector: 'app-settings-actions',
  imports: [Tooltip],
  templateUrl: './settings-actions.html',
  styleUrl: './settings-actions.scss',
})
export class SettingsActions {
  readonly state = input.required<ApplyState>();
  readonly restoreDefaults = output();

  protected readonly applying = computed(() => this.state() === 'applying');
  protected readonly canApply = computed(() => this.state() === 'ready');
  protected readonly note = computed(() => NOTES[this.state()]);
  /** Why Apply is (or isn't) available, shown when hovering or focusing it. */
  protected readonly tooltip = computed(() => TOOLTIPS[this.state()]);
}
