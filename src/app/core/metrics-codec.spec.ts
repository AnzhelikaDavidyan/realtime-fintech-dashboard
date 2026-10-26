import { InstrumentMetrics } from './instrument-metrics';
import { decodeMetrics, encodeMetrics, METRICS_FIELDS, METRICS_STRIDE } from './metrics-codec';

const full: InstrumentMetrics = {
  instrument: 0,
  bid: 10_196,
  ask: 10_200,
  bidQty: 60,
  askQty: 40,
  spread: 4,
  imbalance: 0.2,
  lastPrice: 10_200,
  volume: 40,
  vwap: 10_150,
};

const empty: InstrumentMetrics = {
  instrument: 1,
  bid: null,
  ask: null,
  bidQty: null,
  askQty: null,
  spread: null,
  imbalance: null,
  lastPrice: null,
  volume: 0,
  vwap: null,
};

describe('metrics codec', () => {
  it('lists every InstrumentMetrics field exactly once', () => {
    expect([...METRICS_FIELDS].sort()).toEqual(Object.keys(full).sort());
  });

  it('packs METRICS_STRIDE numbers per instrument', () => {
    expect(encodeMetrics([full, empty])).toHaveLength(2 * METRICS_STRIDE);
  });

  it('round-trips values, including nulls and fractions', () => {
    expect(decodeMetrics(encodeMetrics([full, empty]))).toEqual([full, empty]);
  });

  it('stores null as NaN', () => {
    const packed = encodeMetrics([empty]);
    expect(Number.isNaN(packed[METRICS_FIELDS.indexOf('bid')])).toBe(true);
    expect(packed[METRICS_FIELDS.indexOf('volume')]).toBe(0);
  });

  it('handles an empty list', () => {
    expect(decodeMetrics(encodeMetrics([]))).toEqual([]);
  });

  it('rejects a buffer of the wrong length', () => {
    expect(() => decodeMetrics(new Float64Array(METRICS_STRIDE + 1))).toThrow(RangeError);
  });
});
