import { MARKET_UPDATE_STRIDE, MarketUpdateField } from './market-update';

describe('MarketUpdateField', () => {
  it('maps every position of the stride to exactly one field', () => {
    // Sorted positions must be exactly 0..6: a gap or a duplicate fails.
    const positions = Object.values(MarketUpdateField).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: MARKET_UPDATE_STRIDE }, (_, i) => i));
  });
});
