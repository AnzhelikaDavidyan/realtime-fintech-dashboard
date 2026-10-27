import { Component, input, signal } from '@angular/core';

/**
 * Shows `text` above the projected control on hover and keyboard focus.
 * Escape hides it until the pointer or focus leaves. The control should
 * reference the tooltip with `aria-describedby` set to `tooltipId`.
 */
@Component({
  selector: 'app-tooltip',
  templateUrl: './tooltip.html',
  styleUrl: './tooltip.scss',
  host: {
    '(keydown.escape)': 'dismissed.set(true)',
    '(mouseleave)': 'dismissed.set(false)',
    '(focusout)': 'dismissed.set(false)',
  },
})
export class Tooltip {
  readonly text = input.required<string>();
  readonly tooltipId = input.required<string>();

  protected readonly dismissed = signal(false);
}
