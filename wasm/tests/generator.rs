//! Behaviour of the market generator through its public API.

use findev_wasm::{MAX_STEP, MarketGenerator, UPDATE_STRIDE};

type Update = [i32; UPDATE_STRIDE];

const INSTRUMENT: usize = 0;
const BID: usize = 1;
const ASK: usize = 2;
const BID_QTY: usize = 3;
const ASK_QTY: usize = 4;
const TRADE_PRICE: usize = 5;
const TRADE_QTY: usize = 6;

fn generator(seed: u64, instruments: u32) -> MarketGenerator {
    MarketGenerator::try_new(seed, instruments).expect("valid generator")
}

fn split(batch: &[i32]) -> Vec<Update> {
    let (updates, rest) = batch.as_chunks::<UPDATE_STRIDE>();
    assert!(
        rest.is_empty(),
        "batch length must be a multiple of {UPDATE_STRIDE}"
    );
    updates.to_vec()
}

/// Mid price as encoded by the generator (bid = mid - spread / 2).
fn mid(u: &Update) -> i32 {
    u[BID] + (u[ASK] - u[BID]) / 2
}

#[test]
fn batch_length_matches_requested_size() {
    let mut g = generator(1, 5);
    for n in [0, 1, 7, 1_000, 100_000] {
        assert_eq!(g.generate_batch(n).len(), n * UPDATE_STRIDE, "n = {n}");
    }
}

#[test]
fn invariants_hold_over_100k_updates() {
    let instruments = 16;
    let updates = split(&generator(2024, instruments).generate_batch(100_000));
    assert_eq!(updates.len(), 100_000);

    for (i, u) in updates.iter().enumerate() {
        assert!(
            (0..instruments as i32).contains(&u[INSTRUMENT]),
            "#{i}: instrument {}",
            u[INSTRUMENT]
        );
        assert!(
            u[BID] > 0 && u[ASK] > 0,
            "#{i}: prices must be positive: {u:?}"
        );
        assert!(u[BID] < u[ASK], "#{i}: bid must be below ask: {u:?}");
        assert!(
            u[TRADE_PRICE] == u[BID] || u[TRADE_PRICE] == u[ASK],
            "#{i}: trade must print at bid or ask: {u:?}"
        );
        assert!(
            u[TRADE_QTY] > 0,
            "#{i}: trade quantity must be positive: {u:?}"
        );
        assert!(
            u[BID_QTY] >= 0 && u[ASK_QTY] >= 0,
            "#{i}: book quantities must be nonnegative: {u:?}"
        );
    }
}

#[test]
fn same_seed_gives_same_output() {
    let a = generator(42, 8).generate_batch(10_000);
    let b = generator(42, 8).generate_batch(10_000);
    assert_eq!(a, b);
}

#[test]
fn different_seeds_give_different_output() {
    assert_ne!(
        generator(42, 8).generate_batch(100),
        generator(43, 8).generate_batch(100)
    );
}

#[test]
fn prices_evolve_from_the_previous_value() {
    let instruments = 4;
    let updates = split(&generator(7, instruments).generate_batch(100_000));
    let mut last = vec![None; instruments as usize];
    let mut moved = 0;

    for u in &updates {
        let current = mid(u);
        if let Some(prev) = last[u[INSTRUMENT] as usize].replace(current) {
            let step = (current - prev).abs();
            assert!(step <= MAX_STEP, "mid jumped {prev} -> {current}");
            moved += usize::from(step > 0);
        }
    }

    assert!(
        last.iter().all(Option::is_some),
        "every instrument must update"
    );
    assert!(
        moved > updates.len() / 2,
        "prices should actually move, moved {moved}"
    );
}

#[test]
fn state_persists_between_calls() {
    // Many small calls produce exactly the same stream as one large call.
    let mut chunked = generator(99, 6);
    let mut stream = Vec::new();
    for n in [1, 10, 250, 3, 736] {
        stream.extend(chunked.generate_batch(n));
    }
    assert_eq!(stream, generator(99, 6).generate_batch(1_000));

    // And prices continue from where the previous call left off.
    let mut g = generator(5, 1);
    let first = split(&g.generate_batch(500));
    let second = split(&g.generate_batch(1));
    let jump = (mid(&second[0]) - mid(first.last().unwrap())).abs();
    assert!(
        jump <= MAX_STEP,
        "price reset between calls: jump of {jump}"
    );
}

#[test]
fn rejects_zero_instruments() {
    assert!(MarketGenerator::try_new(1, 0).is_err());
}
