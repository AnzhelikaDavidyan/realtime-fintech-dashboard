/**
 * Aggregated view of one instrument, computed in the worker and sent to the UI
 * in snapshots. Prices are integer ticks and quantities integer lots; `vwap` is
 * a derived average and may be fractional. A value is `null` until the data
 * it depends on has arrived (no quote yet, or no trades yet).
 */
export interface InstrumentMetrics {
  readonly instrument: number;
  readonly bid: number | null;
  readonly ask: number | null;
  readonly bidQty: number | null;
  readonly askQty: number | null;
  /** ask − bid, in ticks. */
  readonly spread: number | null;
  /**
   * Order-book imbalance, (bidQty − askQty) / (bidQty + askQty), from −1 to 1.
   * Positive means more buying interest. Null when there is no quantity on the book.
   */
  readonly imbalance: number | null;
  readonly lastPrice: number | null;
  /** Total traded quantity, in lots. 0 before the first trade. */
  readonly volume: number;
  /** Volume-weighted average trade price, in ticks. */
  readonly vwap: number | null;
}
