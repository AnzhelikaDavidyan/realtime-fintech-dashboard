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

describe('MetricsAggregator', () => {
  it('returns null for everything before any data arrives', () => {
    expect(new MetricsAggregator(2).metrics(1)).toEqual({
      instrument: 1,
      bid: null,
      ask: null,
      bidQty: null,
      askQty: null,
      spread: null,
      lastPrice: null,
      volume: 0,
      vwap: null,
    });
  });

  it('keeps the latest quote and its quantities', () => {
    const agg = new MetricsAggregator(1);
    agg.ingest(batch({ instrument: 0, bid: 100, ask: 103, bidQty: 5, askQty: 7 }));
    agg.ingest(batch({ instrument: 0, bid: 101, ask: 102, bidQty: 8, askQty: 9 }));
    expect(agg.metrics(0)).toMatchObject({ bid: 101, ask: 102, bidQty: 8, askQty: 9, spread: 1 });
  });

  it('keeps last price null while there are quotes but no trades', () => {
    const agg = new MetricsAggregator(1);
    agg.ingest(batch({ instrument: 0, tradeQty: 0 }));
    expect(agg.metrics(0)).toMatchObject({ lastPrice: null, volume: 0, vwap: null });
    expect(agg.metrics(0).bid).not.toBeNull();
  });

  it('accumulates volume, last price and VWAP over trades', () => {
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

  it('keeps instruments independent', () => {
    const agg = new MetricsAggregator(3);
    agg.ingest(batch({ instrument: 2, bid: 500, ask: 505, tradePrice: 505, tradeQty: 4 }));
    expect(agg.metrics(2)).toMatchObject({ bid: 500, lastPrice: 505, volume: 4 });
    expect(agg.metrics(0).bid).toBeNull();
    expect(agg.metrics(1).volume).toBe(0);
  });

  it('returns a snapshot for every instrument in id order', () => {
    const agg = new MetricsAggregator(3);
    agg.ingest(batch({ instrument: 1, tradeQty: 2 }));
    expect(agg.snapshot().map((m) => m.instrument)).toEqual([0, 1, 2]);
    expect(agg.snapshot()[1].volume).toBe(2);
  });

  it('accepts an empty batch', () => {
    const agg = new MetricsAggregator(1);
    agg.ingest(new Int32Array(0));
    expect(agg.metrics(0).bid).toBeNull();
  });

  it('resets all accumulators', () => {
    const agg = new MetricsAggregator(1);
    agg.ingest(batch({ instrument: 0, tradeQty: 5 }));
    agg.reset();
    expect(agg.metrics(0)).toEqual(new MetricsAggregator(1).metrics(0));
  });

  it('rejects malformed input', () => {
    const agg = new MetricsAggregator(2);
    expect(() => agg.ingest(new Int32Array(6))).toThrow(RangeError);
    expect(() => agg.ingest(batch({ instrument: 2 }))).toThrow(/outside 0\.\.1/);
    expect(() => agg.ingest(batch({ instrument: -1 }))).toThrow(RangeError);
    expect(() => agg.metrics(5)).toThrow(RangeError);
    expect(() => new MetricsAggregator(0)).toThrow(RangeError);
  });
});
