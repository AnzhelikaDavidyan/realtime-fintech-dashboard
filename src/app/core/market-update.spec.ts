import { MARKET_UPDATE_STRIDE, MarketUpdateField } from './market-update';

describe('MarketUpdateField', () => {
  it('maps every position of the stride to exactly one field', () => {
    const positions = Object.values(MarketUpdateField).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: MARKET_UPDATE_STRIDE }, (_, i) => i));
  });
});
