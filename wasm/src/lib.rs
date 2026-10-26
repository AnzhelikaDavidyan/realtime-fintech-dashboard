use wasm_bindgen::prelude::*;

mod market;
mod rng;

pub use market::{MarketGenerator, UPDATE_STRIDE};
pub use rng::Rng;

/// Crate version, so the app can confirm which producer build it loaded.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_matches_crate() {
        assert_eq!(version(), env!("CARGO_PKG_VERSION"));
    }
}
