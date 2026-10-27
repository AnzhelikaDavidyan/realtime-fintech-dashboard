import { Component, computed, input } from '@angular/core';

import { NO_VALUE } from '../format/formatters';

/**
 * Shows an already formatted value. A missing value ("—") stays a dash for
 * sighted users but is announced as "not available" by screen readers, which
 * would otherwise read "em dash" or nothing at all.
 *
 * Usage: `<app-value [text]="row.bid | price" />`
 */
@Component({
  selector: 'app-value',
  template: `
    @if (missing()) {
      <span aria-hidden="true">{{ dash }}</span>
      <span class="visually-hidden">{{ missingLabel() }}</span>
    } @else {
      {{ text() }}
    }
  `,
})
export class Value {
  readonly text = input.required<string>();
  /** What screen readers announce for a missing value. */
  readonly missingLabel = input('not available');

  protected readonly missing = computed(() => this.text() === NO_VALUE);
  protected readonly dash = NO_VALUE;
}
