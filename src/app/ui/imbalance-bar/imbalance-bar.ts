import { Component, computed, input } from '@angular/core';

/** Half the bar in percent of its width; the centre line marks zero. The width itself is set in CSS. */
const HALF = 50;

/**
 * Horizontal bar for an order-book imbalance from −1 to +1: grows right in
 * green for buying pressure and left in red for selling pressure. Purely
 * visual; the number next to it carries the value for screen readers.
 */
@Component({
  selector: 'app-imbalance-bar',
  host: { 'aria-hidden': 'true' },
  template: `
    <span class="track"></span>
    @if (fill(); as fill) {
      <span
        class="fill"
        [class.fill--buy]="fill.side === 'buy'"
        [class.fill--sell]="fill.side === 'sell'"
        [style.left.%]="fill.left"
        [style.width.%]="fill.width"
      ></span>
    }
    <span class="center"></span>
  `,
  styleUrl: './imbalance-bar.scss',
})
export class ImbalanceBar {
  /** Imbalance from −1 to +1, or null when there is nothing on the book. */
  readonly value = input.required<number | null>();

  protected readonly fill = computed(() => {
    const value = this.value();
    if (value === null || !Number.isFinite(value) || value === 0) {
      return null;
    }
    const width = Math.min(Math.abs(value), 1) * HALF;
    return value > 0
      ? { side: 'buy' as const, left: HALF, width }
      : { side: 'sell' as const, left: HALF - width, width };
  });
}
