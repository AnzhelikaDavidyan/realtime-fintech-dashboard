/**
 * One order-book update from the Wasm producer. Prices are integer ticks and
 * quantities are integer lots, so no floating point is involved for money.
 */
export interface MarketUpdate {
  readonly instrument: number;
  readonly bid: number;
  readonly ask: number;
  readonly bidQty: number;
  readonly askQty: number;
  readonly tradePrice: number;
  readonly tradeQty: number;
}

/** Integers per update in a producer batch (`Int32Array`). Mirrors `UPDATE_STRIDE` in wasm/src/market.rs. */
export const MARKET_UPDATE_STRIDE = 7;

/** Position of each field within one update of a batch. Mirrors the layout in wasm/src/market.rs. */
export const MarketUpdateField = {
  Instrument: 0,
  Bid: 1,
  Ask: 2,
  BidQty: 3,
  AskQty: 4,
  TradePrice: 5,
  TradeQty: 6,
} as const;
