import { formatImbalance, formatPrice, formatVolume, NO_VALUE } from './formatters';

const MINUS = '\u2212';

describe('formatPrice', () => {
  it.each([
    [10_200, '$102.00'],
    [10_150, '$101.50'],
    [4, '$0.04'],
    [0, '$0.00'],
    [123_456_789, '$1,234,567.89'],
  ])('formats %d cents as %s', (cents, expected) => {
    expect(formatPrice(cents)).toBe(expected);
  });

  it('rounds fractional cents, e.g. a VWAP, to whole cents', () => {
    // A VWAP can be a fraction of a cent.
    expect(formatPrice(10_150.4)).toBe('$101.50');
    expect(formatPrice(10_150.6)).toBe('$101.51');
  });
});

describe('formatVolume', () => {
  it.each([
    [0, '0'],
    [40, '40'],
    [1_000, '1,000'],
    [1_234_567, '1,234,567'],
  ])('formats %d as %s', (quantity, expected) => {
    expect(formatVolume(quantity)).toBe(expected);
  });
});

describe('formatImbalance', () => {
  it.each([
    [0.2, '+0.20'],
    [-0.35, `${MINUS}0.35`],
    [1, '+1.00'],
    [-1, `${MINUS}1.00`],
    // Halves round away from zero in both directions.
    [0.125, '+0.13'],
    [-0.125, `${MINUS}0.13`],
  ])('formats %d as %s', (imbalance, expected) => {
    expect(formatImbalance(imbalance)).toBe(expected);
  });

  it('uses a true minus sign, not a hyphen', () => {
    expect(formatImbalance(-0.35)).not.toContain('-');
  });

  it('shows anything that rounds to zero as plain 0.00', () => {
    expect(formatImbalance(0)).toBe('0.00');
    expect(formatImbalance(0.004)).toBe('0.00');
    expect(formatImbalance(-0.004)).toBe('0.00');
    // Negative zero must not print with a minus sign.
    expect(formatImbalance(-0)).toBe('0.00');
  });
});

describe('missing values', () => {
  const formatters = { formatPrice, formatVolume, formatImbalance };

  for (const [name, format] of Object.entries(formatters)) {
    it(`${name} shows a dash for null, undefined, NaN and Infinity`, () => {
      for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(format(value)).toBe(NO_VALUE);
      }
    });
  }

  it('uses an em dash', () => {
    expect(NO_VALUE).toBe('—');
  });
});

describe('locale and currency', () => {
  const de = { locale: 'de-DE', currency: 'EUR' };

  it('formats prices for another locale and currency', () => {
    // German uses "." for thousands, "," for decimals and a non-breaking space before €.
    expect(formatPrice(123_450, de)).toBe('1.234,50\u00a0€');
  });

  it('formats volume and imbalance for another locale', () => {
    expect(formatVolume(1_234_567, de)).toBe('1.234.567');
    expect(formatImbalance(-0.35, de)).toBe(`${MINUS}0,35`);
    expect(formatImbalance(0.2, de)).toBe('+0,20');
  });

  it('defaults to en-US and USD', () => {
    expect(formatPrice(123_450)).toBe('$1,234.50');
  });
});
