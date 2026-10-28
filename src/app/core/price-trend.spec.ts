import { InstrumentMetrics } from './instrument-metrics';
import { NO_TRENDS, nextTrends, TrendState } from './price-trend';

const row = (instrument: number, lastPrice: number | null): InstrumentMetrics => ({
  instrument,
  bid: null,
  ask: null,
  bidQty: null,
  askQty: null,
  spread: null,
  imbalance: null,
  lastPrice,
  volume: 0,
  vwap: null,
});

function run(...snapshots: InstrumentMetrics[][]): TrendState {
  return snapshots.reduce(nextTrends, NO_TRENDS);
}

describe('nextTrends', () => {
  it('has no arrow for the first price seen', () => {
    expect(run([row(0, 100)]).trends.get(0)).toBeUndefined();
  });

  it('points up when the price rises and down when it falls', () => {
    expect(run([row(0, 100)], [row(0, 101)]).trends.get(0)).toBe('up');
    expect(run([row(0, 100)], [row(0, 99)]).trends.get(0)).toBe('down');
  });

  it('keeps the last arrow while the price does not move', () => {
    expect(run([row(0, 100)], [row(0, 99)], [row(0, 99)], [row(0, 99)]).trends.get(0)).toBe('down');
  });

  it('tracks every instrument separately', () => {
    const state = run([row(0, 100), row(1, 50)], [row(0, 101), row(1, 49)]);
    expect(state.trends.get(0)).toBe('up');
    expect(state.trends.get(1)).toBe('down');
  });

  it('ignores instruments without a trade yet', () => {
    const state = run([row(0, null)], [row(0, 100)]);
    expect(state.trends.get(0)).toBeUndefined();
    expect(state.prices.get(0)).toBe(100);
  });

  it('starts over when the rows are cleared for a new run', () => {
    const state = run([row(0, 100)], [row(0, 101)], [], [row(0, 90)]);
    expect(state.trends.get(0)).toBeUndefined();
  });
});
