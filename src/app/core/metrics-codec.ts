import { InstrumentMetrics } from './instrument-metrics';

/**
 * Order of the fields of one instrument in a packed metrics buffer.
 * Snapshots travel from the worker as one Float64Array (transferable, no copy)
 * instead of an array of objects; `null` is stored as NaN.
 */
export const METRICS_FIELDS = [
  'instrument',
  'bid',
  'ask',
  'bidQty',
  'askQty',
  'spread',
  'imbalance',
  'lastPrice',
  'volume',
  'vwap',
] as const satisfies readonly (keyof InstrumentMetrics)[];

export const METRICS_STRIDE = METRICS_FIELDS.length;

/** Packs metrics into a Float64Array of `metrics.length × METRICS_STRIDE` numbers. */
export function encodeMetrics(metrics: readonly InstrumentMetrics[]): Float64Array {
  const out = new Float64Array(metrics.length * METRICS_STRIDE);
  metrics.forEach((m, row) => {
    METRICS_FIELDS.forEach((field, col) => {
      out[row * METRICS_STRIDE + col] = m[field] ?? Number.NaN;
    });
  });
  return out;
}

/** Unpacks a buffer made by `encodeMetrics`. */
export function decodeMetrics(packed: Float64Array): InstrumentMetrics[] {
  if (packed.length % METRICS_STRIDE !== 0) {
    throw new RangeError(
      `packed metrics length ${packed.length} is not a multiple of ${METRICS_STRIDE}`,
    );
  }
  const rows: InstrumentMetrics[] = [];
  for (let i = 0; i < packed.length; i += METRICS_STRIDE) {
    const at = (field: (typeof METRICS_FIELDS)[number]) =>
      packed[i + METRICS_FIELDS.indexOf(field)];
    const nullable = (field: (typeof METRICS_FIELDS)[number]) => {
      const value = at(field);
      return Number.isNaN(value) ? null : value;
    };
    rows.push({
      instrument: at('instrument'),
      bid: nullable('bid'),
      ask: nullable('ask'),
      bidQty: nullable('bidQty'),
      askQty: nullable('askQty'),
      spread: nullable('spread'),
      imbalance: nullable('imbalance'),
      lastPrice: nullable('lastPrice'),
      volume: at('volume'),
      vwap: nullable('vwap'),
    });
  }
  return rows;
}
