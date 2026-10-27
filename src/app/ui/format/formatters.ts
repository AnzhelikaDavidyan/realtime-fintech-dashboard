/** Shown in place of a value that is not available yet. */
export const NO_VALUE = '—';

const LOCALE = 'en-US';

// Created once: formatting runs for every cell on every snapshot.
const priceFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const volumeFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

const imbalanceFormat = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  // "+0.20" / "-0.35", and plain "0.00" for anything that rounds to zero.
  signDisplay: 'exceptZero',
});

const isMissing = (value: number | null | undefined): value is null | undefined =>
  value === null || value === undefined || !Number.isFinite(value);

/** Price in cents (ticks of $0.01) as dollars: 10200 → "$102.00". */
export function formatPrice(cents: number | null | undefined): string {
  return isMissing(cents) ? NO_VALUE : priceFormat.format(cents / 100);
}

/** Whole quantity with thousand separators: 1234567 → "1,234,567". */
export function formatVolume(quantity: number | null | undefined): string {
  return isMissing(quantity) ? NO_VALUE : volumeFormat.format(quantity);
}

/** Order-book imbalance with an explicit sign: 0.2 → "+0.20", -0.35 → "−0.35". */
export function formatImbalance(imbalance: number | null | undefined): string {
  if (isMissing(imbalance)) {
    return NO_VALUE;
  }
  // Use a true minus sign (U+2212) so positive and negative values line up.
  return imbalanceFormat.format(imbalance).replace('-', '−');
}
