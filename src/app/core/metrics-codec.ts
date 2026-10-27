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

type MetricsField = (typeof METRICS_FIELDS)[number];

/** Column of each field, worked out once so decoding does no lookups per row. */
const COL = Object.fromEntries(METRICS_FIELDS.map((field, col) => [field, col])) as Record<
  MetricsField,
  number
>;

const orNull = (value: number): number | null => (Number.isNaN(value) ? null : value);

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
    rows.push({
      instrument: packed[i + COL.instrument],
      bid: orNull(packed[i + COL.bid]),
      ask: orNull(packed[i + COL.ask]),
      bidQty: orNull(packed[i + COL.bidQty]),
      askQty: orNull(packed[i + COL.askQty]),
      spread: orNull(packed[i + COL.spread]),
      imbalance: orNull(packed[i + COL.imbalance]),
      lastPrice: orNull(packed[i + COL.lastPrice]),
      volume: packed[i + COL.volume],
      vwap: orNull(packed[i + COL.vwap]),
    });
  }
  return rows;
}
