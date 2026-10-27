import { InstrumentMetrics } from './instrument-metrics';
import { MARKET_UPDATE_STRIDE, MarketUpdateField as F } from './market-update';

/**
 * Cumulative per-instrument metrics over a stream of producer batches.
 *
 * Keeps only O(1) accumulators per instrument in typed arrays (no update
 * history), so memory stays constant however long the stream runs.
 * Sums use float64: they are exact while sum(price × qty) stays below 2^53.
 */
export class MetricsAggregator {
  /** 1 once a bid/ask has arrived for the instrument; tells "not seen yet" apart from a real 0. */
  private readonly hasBidAsk: Uint8Array;
  private readonly bid: Int32Array;
  private readonly ask: Int32Array;
  private readonly bidQty: Int32Array;
  private readonly askQty: Int32Array;
  /** 1 once the instrument has traded at least once. */
  private readonly hasTrade: Uint8Array;
  private readonly lastPrice: Int32Array;
  private readonly volume: Float64Array;
  private readonly notional: Float64Array;

  constructor(readonly instrumentCount: number) {
    if (!Number.isInteger(instrumentCount) || instrumentCount < 1) {
      throw new RangeError(`instrumentCount must be a positive integer, got ${instrumentCount}`);
    }
    this.hasBidAsk = new Uint8Array(instrumentCount);
    this.bid = new Int32Array(instrumentCount);
    this.ask = new Int32Array(instrumentCount);
    this.bidQty = new Int32Array(instrumentCount);
    this.askQty = new Int32Array(instrumentCount);
    this.hasTrade = new Uint8Array(instrumentCount);
    this.lastPrice = new Int32Array(instrumentCount);
    this.volume = new Float64Array(instrumentCount);
    this.notional = new Float64Array(instrumentCount);
  }

  /** Folds a producer batch (n × 7 integers) into the accumulators. */
  ingest(batch: Int32Array): void {
    if (batch.length % MARKET_UPDATE_STRIDE !== 0) {
      throw new RangeError(
        `batch length ${batch.length} is not a multiple of ${MARKET_UPDATE_STRIDE}`,
      );
    }
    for (let i = 0; i < batch.length; i += MARKET_UPDATE_STRIDE) {
      const id = batch[i + F.Instrument];
      this.assertInstrument(id);
      this.hasBidAsk[id] = 1;
      this.bid[id] = batch[i + F.Bid];
      this.ask[id] = batch[i + F.Ask];
      this.bidQty[id] = batch[i + F.BidQty];
      this.askQty[id] = batch[i + F.AskQty];

      const qty = batch[i + F.TradeQty];
      if (qty > 0) {
        const price = batch[i + F.TradePrice];
        this.hasTrade[id] = 1;
        this.lastPrice[id] = price;
        this.volume[id] += qty;
        this.notional[id] += price * qty;
      }
    }
  }

  /** Current metrics for one instrument. */
  metrics(instrument: number): InstrumentMetrics {
    this.assertInstrument(instrument);
    const bidAskKnown = this.hasBidAsk[instrument] === 1;
    const traded = this.hasTrade[instrument] === 1;
    const volume = this.volume[instrument];
    const bookQty = this.bidQty[instrument] + this.askQty[instrument];
    return {
      instrument,
      bid: bidAskKnown ? this.bid[instrument] : null,
      ask: bidAskKnown ? this.ask[instrument] : null,
      bidQty: bidAskKnown ? this.bidQty[instrument] : null,
      askQty: bidAskKnown ? this.askQty[instrument] : null,
      spread: bidAskKnown ? this.ask[instrument] - this.bid[instrument] : null,
      imbalance:
        bidAskKnown && bookQty > 0
          ? (this.bidQty[instrument] - this.askQty[instrument]) / bookQty
          : null,
      lastPrice: traded ? this.lastPrice[instrument] : null,
      volume,
      vwap: volume > 0 ? this.notional[instrument] / volume : null,
    };
  }

  /** Current metrics for every instrument, ordered by instrument id. */
  snapshot(): InstrumentMetrics[] {
    return Array.from({ length: this.instrumentCount }, (_, i) => this.metrics(i));
  }

  /** Clears all accumulators. */
  reset(): void {
    for (const array of [
      this.hasBidAsk,
      this.bid,
      this.ask,
      this.bidQty,
      this.askQty,
      this.hasTrade,
      this.lastPrice,
      this.volume,
      this.notional,
    ]) {
      array.fill(0);
    }
  }

  private assertInstrument(id: number): void {
    if (!Number.isInteger(id) || id < 0 || id >= this.instrumentCount) {
      throw new RangeError(`instrument ${id} is outside 0..${this.instrumentCount - 1}`);
    }
  }
}
