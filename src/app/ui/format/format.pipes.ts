import { DEFAULT_CURRENCY_CODE, inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';

import { formatImbalance, formatPrice, formatVolume } from './formatters';

/**
 * `{{ row.bid | price }}` → "$102.00", or "—" when not available.
 * Follows the app's `LOCALE_ID` and `DEFAULT_CURRENCY_CODE`.
 */
@Pipe({ name: 'price' })
export class PricePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);
  private readonly currency = inject(DEFAULT_CURRENCY_CODE);

  transform(cents: number | null | undefined): string {
    return formatPrice(cents, { locale: this.locale, currency: this.currency });
  }
}

/** `{{ row.volume | volume }}` → "1,234,567". Follows the app's `LOCALE_ID`. */
@Pipe({ name: 'volume' })
export class VolumePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(quantity: number | null | undefined): string {
    return formatVolume(quantity, { locale: this.locale });
  }
}

/** `{{ row.imbalance | imbalance }}` → "+0.20" / "−0.35". Follows the app's `LOCALE_ID`. */
@Pipe({ name: 'imbalance' })
export class ImbalancePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(imbalance: number | null | undefined): string {
    return formatImbalance(imbalance, { locale: this.locale });
  }
}
