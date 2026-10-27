import { InstrumentMetrics } from '../core/instrument-metrics';

/** Direction of the last price compared with the previous snapshot. */
export type Trend = 'up' | 'down';

export interface TrendState {
  /** Last price seen per instrument. */
  readonly prices: ReadonlyMap<number, number>;
  /** Latest direction per instrument; kept while the price stays the same. */
  readonly trends: ReadonlyMap<number, Trend>;
}

export const NO_TRENDS: TrendState = { prices: new Map(), trends: new Map() };

/**
 * Works out each instrument's price direction from the previous snapshot.
 * A price that has not moved keeps its last arrow, so it does not flicker.
 */
export function nextTrends(previous: TrendState, rows: readonly InstrumentMetrics[]): TrendState {
  const prices = new Map<number, number>();
  const trends = new Map<number, Trend>();
  for (const { instrument, lastPrice } of rows) {
    if (lastPrice === null) {
      continue;
    }
    prices.set(instrument, lastPrice);
    const before = previous.prices.get(instrument);
    const kept = previous.trends.get(instrument);
    if (before !== undefined && lastPrice > before) {
      trends.set(instrument, 'up');
    } else if (before !== undefined && lastPrice < before) {
      trends.set(instrument, 'down');
    } else if (kept) {
      trends.set(instrument, kept);
    }
  }
  return { prices, trends };
}
