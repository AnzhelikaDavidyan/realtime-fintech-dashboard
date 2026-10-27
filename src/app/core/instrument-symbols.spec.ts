import { instrumentSymbol, symbolAvatar } from './instrument-symbols';

describe('instrument symbols', () => {
  it('starts with the symbols from the design', () => {
    expect([0, 1, 2, 3, 4].map(instrumentSymbol)).toEqual(['ALFA', 'BETA', 'GAMA', 'DELT', 'EPSI']);
  });

  it('gives every instrument up to the maximum (100) a unique symbol', () => {
    const symbols = Array.from({ length: 100 }, (_, i) => instrumentSymbol(i));
    expect(new Set(symbols).size).toBe(100);
  });

  it('numbers symbols after the 24 base ones', () => {
    expect(instrumentSymbol(23)).toBe('OMEG');
    expect(instrumentSymbol(24)).toBe('ALFA2');
    expect(instrumentSymbol(48)).toBe('ALFA3');
  });

  it('uses the first two letters as the avatar', () => {
    expect(symbolAvatar('ALFA')).toBe('AL');
    expect(symbolAvatar('EPSI')).toBe('EP');
  });
});
