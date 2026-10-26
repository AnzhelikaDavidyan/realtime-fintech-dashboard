use wasm_bindgen::prelude::*;

use crate::rng::Rng;

/// Integers per update in a `generate_batch` result. Each update is laid out as
/// `[instrument, bid, ask, bid_qty, ask_qty, trade_price, trade_qty]`.
/// Prices are integer ticks (no floating point for money); quantities are lots.
pub const UPDATE_STRIDE: usize = 7;

/// Largest mid-price move per update, in ticks.
const MAX_STEP: i32 = 3;
/// Spread stays within [1, MAX_SPREAD] ticks, so bid < ask always holds.
const MAX_SPREAD: i32 = 10;
/// Keeping mid >= MAX_SPREAD keeps bid = mid - spread / 2 >= 1.
const MIN_MID: i32 = MAX_SPREAD;
const MAX_MID: i32 = 10_000_000;
/// Book quantities stay within [1, MAX_QTY].
const MAX_QTY: i32 = 10_000;
const QTY_STEP: i32 = 50;
const MAX_TRADE: i32 = 500;

#[derive(Clone, Debug)]
struct Instrument {
    mid: i32,
    spread: i32,
    bid_qty: i32,
    ask_qty: i32,
}

/// Simulated order-book feed. Deterministic for a given seed and instrument count.
#[wasm_bindgen]
pub struct MarketGenerator {
    rng: Rng,
    instruments: Vec<Instrument>,
}

#[wasm_bindgen]
impl MarketGenerator {
    /// Creates a generator for `instruments` instruments (at least 1).
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u64, instruments: u32) -> Result<MarketGenerator, JsError> {
        Self::try_new(seed, instruments).map_err(|e| JsError::new(&e))
    }

    /// Number of integers per update (7).
    #[wasm_bindgen(getter)]
    pub fn stride(&self) -> usize {
        UPDATE_STRIDE
    }

    /// Generates `n` updates as a flat `Int32Array` of `n * 7` integers.
    #[wasm_bindgen(js_name = generateBatch)]
    pub fn generate_batch(&mut self, n: usize) -> Vec<i32> {
        let mut out = Vec::with_capacity(n * UPDATE_STRIDE);
        for _ in 0..n {
            out.extend_from_slice(&self.next_update());
        }
        out
    }
}

impl MarketGenerator {
    pub fn try_new(seed: u64, instruments: u32) -> Result<MarketGenerator, String> {
        if instruments == 0 {
            return Err("MarketGenerator needs at least 1 instrument".into());
        }
        let mut rng = Rng::new(seed);
        let instruments = (0..instruments)
            .map(|_| Instrument {
                mid: rng.int_in_range(1_000, 100_000),
                spread: rng.int_in_range(1, 5),
                bid_qty: rng.int_in_range(100, MAX_QTY),
                ask_qty: rng.int_in_range(100, MAX_QTY),
            })
            .collect();
        Ok(MarketGenerator { rng, instruments })
    }

    fn next_update(&mut self) -> [i32; UPDATE_STRIDE] {
        let rng = &mut self.rng;
        let id = rng.uint_below(self.instruments.len() as u32);
        let inst = &mut self.instruments[id as usize];

        inst.mid = (inst.mid + rng.int_in_range(-MAX_STEP, MAX_STEP)).clamp(MIN_MID, MAX_MID);
        if rng.uint_below(10) == 0 {
            inst.spread = (inst.spread + rng.int_in_range(-1, 1)).clamp(1, MAX_SPREAD);
        }
        let bid = inst.mid - inst.spread / 2;
        let ask = bid + inst.spread;

        inst.bid_qty = (inst.bid_qty + rng.int_in_range(-QTY_STEP, QTY_STEP)).clamp(1, MAX_QTY);
        inst.ask_qty = (inst.ask_qty + rng.int_in_range(-QTY_STEP, QTY_STEP)).clamp(1, MAX_QTY);

        // A buy lifts the ask, a sell hits the bid; the trade consumes that side.
        let buy = rng.uint_below(2) == 1;
        let (trade_price, side_qty) = if buy {
            (ask, &mut inst.ask_qty)
        } else {
            (bid, &mut inst.bid_qty)
        };
        let trade_qty = rng.int_in_range(1, (*side_qty).min(MAX_TRADE));
        *side_qty -= trade_qty;
        if *side_qty == 0 {
            // Side fully taken: new liquidity arrives so the book stays two-sided.
            *side_qty = rng.int_in_range(1, MAX_TRADE);
        }

        [
            id as i32,
            bid,
            ask,
            inst.bid_qty,
            inst.ask_qty,
            trade_price,
            trade_qty,
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn updates(seed: u64, instruments: u32, n: usize) -> Vec<[i32; UPDATE_STRIDE]> {
        let batch = MarketGenerator::try_new(seed, instruments)
            .unwrap()
            .generate_batch(n);
        assert_eq!(batch.len(), n * UPDATE_STRIDE);
        let (chunks, rest) = batch.as_chunks::<UPDATE_STRIDE>();
        assert!(rest.is_empty());
        chunks.to_vec()
    }

    #[test]
    fn rejects_zero_instruments() {
        assert!(MarketGenerator::try_new(1, 0).is_err());
    }

    #[test]
    fn empty_batch() {
        assert!(updates(1, 3, 0).is_empty());
    }

    #[test]
    fn same_seed_same_updates() {
        assert_eq!(updates(42, 5, 500), updates(42, 5, 500));
        assert_ne!(updates(42, 5, 50), updates(43, 5, 50));
    }

    #[test]
    fn batches_continue_the_same_stream() {
        let mut generator = MarketGenerator::try_new(7, 4).unwrap();
        let mut split = generator.generate_batch(30);
        split.extend(generator.generate_batch(70));
        let whole = MarketGenerator::try_new(7, 4).unwrap().generate_batch(100);
        assert_eq!(split, whole);
    }

    #[test]
    fn every_update_is_valid() {
        let count = 8;
        for [id, bid, ask, bid_qty, ask_qty, trade_price, trade_qty] in updates(99, count, 50_000) {
            assert!((0..count as i32).contains(&id));
            assert!(bid >= 1 && bid < ask, "bid {bid} must be below ask {ask}");
            assert!(ask - bid <= MAX_SPREAD);
            assert!((1..=MAX_QTY).contains(&bid_qty));
            assert!((1..=MAX_QTY).contains(&ask_qty));
            assert!(trade_price == bid || trade_price == ask);
            assert!((1..=MAX_TRADE).contains(&trade_qty));
        }
    }

    #[test]
    fn mid_moves_by_small_steps_per_instrument() {
        let count = 3;
        let mut last_mid = vec![None; count as usize];
        for [id, bid, ask, ..] in updates(5, count, 20_000) {
            // bid = mid - spread / 2, so this recovers the stored mid exactly.
            let mid = bid + (ask - bid) / 2;
            let prev = last_mid[id as usize].replace(mid);
            if let Some(prev) = prev {
                assert!((mid - prev).abs() <= MAX_STEP, "jump {prev} -> {mid}");
            }
        }
        assert!(
            last_mid.iter().all(Option::is_some),
            "every instrument updated"
        );
    }

    #[test]
    fn trades_happen_on_both_sides() {
        let (mut buys, mut sells) = (0, 0);
        for [_, bid, ask, _, _, price, _] in updates(11, 2, 2_000) {
            if price == ask {
                buys += 1;
            } else if price == bid {
                sells += 1;
            }
        }
        assert!(buys > 0 && sells > 0);
    }
}
