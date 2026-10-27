import { Pipe, PipeTransform } from '@angular/core';

import { formatImbalance, formatPrice, formatVolume } from './formatters';

/** `{{ row.bid | price }}` → "$102.00", or "—" when not available. */
@Pipe({ name: 'price' })
export class PricePipe implements PipeTransform {
  transform(cents: number | null | undefined): string {
    return formatPrice(cents);
  }
}

/** `{{ row.volume | volume }}` → "1,234,567". */
@Pipe({ name: 'volume' })
export class VolumePipe implements PipeTransform {
  transform(quantity: number | null | undefined): string {
    return formatVolume(quantity);
  }
}

/** `{{ row.imbalance | imbalance }}` → "+0.20" / "−0.35". */
@Pipe({ name: 'imbalance' })
export class ImbalancePipe implements PipeTransform {
  transform(imbalance: number | null | undefined): string {
    return formatImbalance(imbalance);
  }
}
