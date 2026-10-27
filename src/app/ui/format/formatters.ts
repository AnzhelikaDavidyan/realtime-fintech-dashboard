/** Shown in place of a value that is not available yet. */
export const NO_VALUE = '—';

export const DEFAULT_LOCALE = 'en-US';
export const DEFAULT_CURRENCY = 'USD';

export interface FormatOptions {
  /** BCP 47 locale, e.g. "en-US" or "de-DE". */
  readonly locale?: string;
  /** ISO 4217 currency code, e.g. "USD" or "EUR". Used by prices only. */
  readonly currency?: string;
}

type Kind = 'price' | 'volume' | 'imbalance';

// Formatting runs for every cell on every snapshot, so each Intl formatter is
// created once per locale/currency and reused.
const formats = new Map<string, Intl.NumberFormat>();

function numberFormat(kind: Kind, locale: string, currency: string): Intl.NumberFormat {
  const key = `${kind}|${locale}|${currency}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, optionsFor(kind, currency));
    formats.set(key, format);
  }
  return format;
}

function optionsFor(kind: Kind, currency: string): Intl.NumberFormatOptions {
  switch (kind) {
    case 'price':
      return { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
    case 'volume':
      return { maximumFractionDigits: 0 };
    case 'imbalance':
      // "+0.20" / "-0.35", and plain "0.00" for anything that rounds to zero.
      return { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' };
  }
}

const isMissing = (value: number | null | undefined): value is null | undefined =>
  value === null || value === undefined || !Number.isFinite(value);

/** Price in cents (ticks of 0.01) as currency: 10200 → "$102.00". */
export function formatPrice(
  cents: number | null | undefined,
  { locale = DEFAULT_LOCALE, currency = DEFAULT_CURRENCY }: FormatOptions = {},
): string {
  return isMissing(cents) ? NO_VALUE : numberFormat('price', locale, currency).format(cents / 100);
}

/** Whole quantity with thousand separators: 1234567 → "1,234,567". */
export function formatVolume(
  quantity: number | null | undefined,
  { locale = DEFAULT_LOCALE }: FormatOptions = {},
): string {
  return isMissing(quantity)
    ? NO_VALUE
    : numberFormat('volume', locale, DEFAULT_CURRENCY).format(quantity);
}

/** Order-book imbalance with an explicit sign: 0.2 → "+0.20", -0.35 → "−0.35". */
export function formatImbalance(
  imbalance: number | null | undefined,
  { locale = DEFAULT_LOCALE }: FormatOptions = {},
): string {
  if (isMissing(imbalance)) {
    return NO_VALUE;
  }
  // Use a true minus sign (U+2212) so positive and negative values line up.
  return numberFormat('imbalance', locale, DEFAULT_CURRENCY)
    .format(imbalance)
    .replace('-', '\u2212');
}
