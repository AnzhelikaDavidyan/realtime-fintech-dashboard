use wasm_bindgen::prelude::*;

/// Seedable xorshift64* generator (Vigna, 2016). Fast and deterministic:
/// the same seed always yields the same sequence. Not cryptographically secure.
#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct Rng {
    state: u64,
}

#[wasm_bindgen]
impl Rng {
    /// Creates a generator from any seed, including 0. The seed is mixed with
    /// splitmix64 so nearby seeds give unrelated sequences and the state is never 0.
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u64) -> Rng {
        let mut state = splitmix64(seed);
        if state == 0 {
            state = 0x9E37_79B9_7F4A_7C15;
        }
        Rng { state }
    }

    /// Next 64 random bits.
    #[wasm_bindgen(js_name = nextU64)]
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// Next 32 random bits (the high half, which has the best quality).
    #[wasm_bindgen(js_name = nextU32)]
    pub fn next_u32(&mut self) -> u32 {
        (self.next_u64() >> 32) as u32
    }

    /// Uniform float in [0, 1) with 53 bits of precision.
    #[wasm_bindgen(js_name = nextF64)]
    pub fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    /// Uniform integer in [min, max], both inclusive, without modulo bias.
    /// Panics if `min > max`.
    #[wasm_bindgen(js_name = intInRange)]
    pub fn int_in_range(&mut self, min: i32, max: i32) -> i32 {
        assert!(min <= max, "intInRange: min ({min}) must be <= max ({max})");
        let span = (i64::from(max) - i64::from(min) + 1) as u64;
        min.wrapping_add(self.below(span) as i32)
    }

    /// Uniform integer in [0, n). Panics if `n == 0`.
    #[wasm_bindgen(js_name = uintBelow)]
    pub fn uint_below(&mut self, n: u32) -> u32 {
        assert!(n > 0, "uintBelow: n must be > 0");
        self.below(u64::from(n)) as u32
    }
}

impl Rng {
    /// Lemire's nearly-divisionless method: uniform in [0, n) for 0 < n <= 2^32.
    fn below(&mut self, n: u64) -> u64 {
        let mut m = u64::from(self.next_u32()) * n;
        let mut low = m & 0xFFFF_FFFF;
        if low < n {
            let threshold = ((1u64 << 32) - n) % n;
            while low < threshold {
                m = u64::from(self.next_u32()) * n;
                low = m & 0xFFFF_FFFF;
            }
        }
        m >> 32
    }
}

fn splitmix64(seed: u64) -> u64 {
    let mut z = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn take(rng: &mut Rng, n: usize) -> Vec<u64> {
        (0..n).map(|_| rng.next_u64()).collect()
    }

    #[test]
    fn same_seed_same_sequence() {
        assert_eq!(take(&mut Rng::new(42), 100), take(&mut Rng::new(42), 100));
    }

    #[test]
    fn different_seeds_differ() {
        assert_ne!(take(&mut Rng::new(1), 10), take(&mut Rng::new(2), 10));
    }

    #[test]
    fn zero_seed_works() {
        let mut rng = Rng::new(0);
        assert!(take(&mut rng, 10).iter().any(|&x| x != 0));
    }

    #[test]
    fn known_sequence_is_stable() {
        // Guards against accidental algorithm changes, which would alter every seeded replay.
        // Expected values computed with an independent reference implementation.
        assert_eq!(Rng { state: 1 }.next_u64(), 0x47E4_CE4B_896C_DD1D);
        assert_eq!(
            take(&mut Rng::new(42), 3),
            [
                0x31B0_ECE7_C4F6_97A2,
                0x9008_A3B1_CB68_6F03,
                0x7C71_73AB_D97B_E16F
            ]
        );
    }

    #[test]
    fn f64_in_unit_interval() {
        let mut rng = Rng::new(7);
        for _ in 0..10_000 {
            let x = rng.next_f64();
            assert!((0.0..1.0).contains(&x));
        }
    }

    #[test]
    fn int_in_range_stays_inclusive_and_hits_both_ends() {
        let mut rng = Rng::new(3);
        let (mut saw_min, mut saw_max) = (false, false);
        for _ in 0..10_000 {
            let x = rng.int_in_range(-5, 5);
            assert!((-5..=5).contains(&x));
            saw_min |= x == -5;
            saw_max |= x == 5;
        }
        assert!(saw_min && saw_max);
    }

    #[test]
    fn int_in_range_single_value() {
        let mut rng = Rng::new(9);
        assert!((0..100).all(|_| rng.int_in_range(17, 17) == 17));
    }

    #[test]
    fn int_in_range_full_i32_span() {
        let mut rng = Rng::new(11);
        for _ in 0..1_000 {
            rng.int_in_range(i32::MIN, i32::MAX);
        }
    }

    #[test]
    #[should_panic(expected = "must be <= max")]
    fn int_in_range_rejects_inverted_bounds() {
        Rng::new(1).int_in_range(5, 4);
    }

    #[test]
    fn uint_below_is_roughly_uniform() {
        let mut rng = Rng::new(123);
        let mut counts = [0u32; 10];
        let draws = 100_000;
        for _ in 0..draws {
            counts[rng.uint_below(10) as usize] += 1;
        }
        let expected = draws / 10;
        for c in counts {
            assert!(
                c.abs_diff(expected) < expected / 20,
                "bucket {c} vs {expected}"
            );
        }
    }
}
