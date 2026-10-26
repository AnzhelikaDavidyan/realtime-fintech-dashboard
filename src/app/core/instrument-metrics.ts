/**
 * Aggregated view of one instrument, computed in the worker and sent to the UI
 * in snapshots. Prices are integer ticks; `vwap` is a derived average and may
 * be fractional.
 */
export interface InstrumentMetrics {
  readonly instrument: number;
  readonly bid: number;
  readonly ask: number;
  readonly spread: number;
  readonly lastPrice: number;
  readonly openPrice: number;
  readonly highPrice: number;
  readonly lowPrice: number;
  /** Volume-weighted average trade price, in ticks. */
  readonly vwap: number;
  /** Total traded quantity, in lots. */
  readonly volume: number;
  readonly tradeCount: number;
}
