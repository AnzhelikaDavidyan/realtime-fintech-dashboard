import { InstrumentMetrics } from './instrument-metrics';
import { MarketUpdate } from './market-update';
import { MetricsAggregator } from './metrics-aggregator';

type Update = Partial<MarketUpdate> & Pick<MarketUpdate, 'instrument'>;

/** Encodes updates in the producer's n × 7 batch layout. */
function batch(...updates: Update[]): Int32Array {
  return Int32Array.from(
    updates.flatMap((u) => [
      u.instrument,
      u.bid ?? 100,
      u.ask ?? 101,
      u.bidQty ?? 10,
      u.askQty ?? 20,
      u.tradePrice ?? u.ask ?? 101,
      u.tradeQty ?? 0,
    ]),
  );
}

/** Prices are integer ticks; the examples use a $0.01 tick. */
const dollars = (ticks: number | null) => (ticks === null ? null : ticks / 100);

const EMPTY: Omit<InstrumentMetrics, 'instrument'> = {
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

describe('MetricsAggregator', () => {
  describe('worked example', () => {
    // 1. Quote $101.00 / $101.04; a seller hits the bid: 20 @ $101.00.
    // 2. Quote $101.96 / $102.00 with 60 bid vs 40 ask; a buyer lifts the ask: 20 @ $102.00.
    const agg = new MetricsAggregator(1);
    agg.ingest(
      batch(
        {
          instrument: 0,
          bid: 10_100,
          ask: 10_104,
          bidQty: 50,
          askQty: 50,
          tradePrice: 10_100,
          tradeQty: 20,
        },
        {
          instrument: 0,
          bid: 10_196,
          ask: 10_200,
          bidQty: 60,
          askQty: 40,
          tradePrice: 10_200,
          tradeQty: 20,
        },
      ),
    );
    const m = agg.metrics(0);

    it('has last price $102.00', () => {
      expect(dollars(m.lastPrice)).toBe(102);
    });

    it('has volume 40', () => {
      expect(m.volume).toBe(40);
    });

    it('has VWAP $101.50', () => {
      // (101.00 × 20 + 102.00 × 20) / 40
      expect(dollars(m.vwap)).toBe(101.5);
    });

    it('has spread $0.04', () => {
      expect(dollars(m.spread)).toBe(0.04);
    });

    it('has imbalance 0.20', () => {
      // (60 − 40) / (60 + 40)
      expect(m.imbalance).toBeCloseTo(0.2, 10);
    });
  });

  describe('initial state', () => {
    it('reports nulls and zero volume before any data', () => {
      expect(new MetricsAggregator(2).metrics(1)).toEqual({ instrument: 1, ...EMPTY });
    });

    it('starts every instrument empty', () => {
      for (const m of new MetricsAggregator(3).snapshot()) {
        expect(m).toEqual({ instrument: m.instrument, ...EMPTY });
      }
    });

    it('stays empty after an empty batch', () => {
      const agg = new MetricsAggregator(1);
      agg.ingest(new Int32Array(0));
      expect(agg.metrics(0)).toEqual({ instrument: 0, ...EMPTY });
    });
  });

  describe('zero denominators', () => {
    it('returns null VWAP, not NaN, while volume is zero', () => {
      const agg = new MetricsAggregator(1);
      agg.ingest(batch({ instrument: 0, tradeQty: 0 }));
      const m = agg.metrics(0);
      expect(m.volume).toBe(0);
      expect(m.vwap).toBeNull();
      expect(m.lastPrice).toBeNull();
    });

    it('returns null imbalance, not NaN, when the book has no quantity', () => {
      const agg = new MetricsAggregator(1);
      agg.ingest(batch({ instrument: 0, bidQty: 0, askQty: 0 }));
      const m = agg.metrics(0);
      expect(m.imbalance).toBeNull();
      expect(m.spread).not.toBeNull();
    });

    it('handles a one-sided book', () => {
      const agg = new MetricsAggregator(1);
      agg.ingest(batch({ instrument: 0, bidQty: 30, askQty: 0 }));
      expect(agg.metrics(0).imbalance).toBe(1);
      agg.ingest(batch({ instrument: 0, bidQty: 0, askQty: 30 }));
      expect(agg.metrics(0).imbalance).toBe(-1);
    });
  });

  describe('isolation between instruments', () => {
    it('only changes the instrument an update belongs to', () => {
      const agg = new MetricsAggregator(3);
      agg.ingest(
        batch({
          instrument: 2,
          bid: 500,
          ask: 505,
          bidQty: 9,
          askQty: 1,
          tradePrice: 505,
          tradeQty: 4,
        }),
      );
      expect(agg.metrics(2)).toMatchObject({ bid: 500, lastPrice: 505, volume: 4, vwap: 505 });
      expect(agg.metrics(0)).toEqual({ instrument: 0, ...EMPTY });
      expect(agg.metrics(1)).toEqual({ instrument: 1, ...EMPTY });
    });

    it('keeps separate totals for interleaved updates', () => {
      const agg = new MetricsAggregator(2);
      agg.ingest(
        batch(
          { instrument: 0, tradePrice: 100, tradeQty: 1 },
          { instrument: 1, tradePrice: 200, tradeQty: 3 },
          { instrument: 0, tradePrice: 110, tradeQty: 1 },
        ),
      );
      expect(agg.metrics(0)).toMatchObject({ lastPrice: 110, volume: 2, vwap: 105 });
      expect(agg.metrics(1)).toMatchObject({ lastPrice: 200, volume: 3, vwap: 200 });
    });

    it('keeps each instrument’s own quote when both are quoted', () => {
      const agg = new MetricsAggregator(2);
      agg.ingest(batch({ instrument: 0, bid: 100, ask: 102, bidQty: 5, askQty: 6 }));
      agg.ingest(batch({ instrument: 1, bid: 900, ask: 910, bidQty: 50, askQty: 60 }));
      expect(agg.metrics(0)).toMatchObject({ bid: 100, ask: 102, bidQty: 5, askQty: 6, spread: 2 });
      expect(agg.metrics(1)).toMatchObject({
        bid: 900,
        ask: 910,
        bidQty: 50,
        askQty: 60,
        spread: 10,
      });
    });
  });

  describe('book quantities vs volume', () => {
    it('does not count resting book quantity as volume', () => {
      const agg = new MetricsAggregator(1);
      agg.ingest(batch({ instrument: 0, bidQty: 9_000, askQty: 8_000, tradeQty: 0 }));
      expect(agg.metrics(0)).toMatchObject({ bidQty: 9_000, askQty: 8_000, volume: 0 });
    });

    it('counts only traded quantity', () => {
      const agg = new MetricsAggregator(1);
      agg.ingest(
        batch(
          { instrument: 0, bidQty: 1_000, askQty: 1_000, tradeQty: 5 },
          { instrument: 0, bidQty: 2_000, askQty: 3_000, tradeQty: 7 },
        ),
      );
      expect(agg.metrics(0).volume).toBe(12);
    });
  });

  describe('accumulation', () => {
    it('keeps the latest quote and its quantities', () => {
      const agg = new MetricsAggregator(1);
      agg.ingest(batch({ instrument: 0, bid: 100, ask: 103, bidQty: 5, askQty: 7 }));
      agg.ingest(batch({ instrument: 0, bid: 101, ask: 102, bidQty: 8, askQty: 9 }));
      expect(agg.metrics(0)).toMatchObject({ bid: 101, ask: 102, bidQty: 8, askQty: 9, spread: 1 });
    });

    it('carries totals across batches', () => {
      const agg = new MetricsAggregator(1);
      agg.ingest(
        batch(
          { instrument: 0, tradePrice: 100, tradeQty: 10 },
          { instrument: 0, tradePrice: 110, tradeQty: 30 },
        ),
      );
      agg.ingest(batch({ instrument: 0, tradePrice: 90, tradeQty: 10 }));
      // (100·10 + 110·30 + 90·10) / 50 = 104
      expect(agg.metrics(0)).toMatchObject({ lastPrice: 90, volume: 50, vwap: 104 });
    });

    it('returns a snapshot for every instrument in id order', () => {
      const agg = new MetricsAggregator(3);
      agg.ingest(batch({ instrument: 1, tradeQty: 2 }));
      expect(agg.snapshot().map((m) => m.instrument)).toEqual([0, 1, 2]);
      expect(agg.snapshot()[1].volume).toBe(2);
    });

    it('resets all accumulators', () => {
      const agg = new MetricsAggregator(1);
      agg.ingest(batch({ instrument: 0, tradeQty: 5 }));
      agg.reset();
      expect(agg.metrics(0)).toEqual({ instrument: 0, ...EMPTY });
    });
  });

  describe('invalid input', () => {
    it('rejects malformed batches and unknown instruments', () => {
      const agg = new MetricsAggregator(2);
      expect(() => agg.ingest(new Int32Array(6))).toThrow(RangeError);
      expect(() => agg.ingest(batch({ instrument: 2 }))).toThrow(/outside 0\.\.1/);
      expect(() => agg.ingest(batch({ instrument: -1 }))).toThrow(RangeError);
      expect(() => agg.metrics(5)).toThrow(RangeError);
      expect(() => new MetricsAggregator(0)).toThrow(RangeError);
    });
  });
});
