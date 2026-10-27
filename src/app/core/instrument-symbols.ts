/**
 * Display symbols for the simulated instruments, matching the design
 * (ALFA, BETA, GAMA, …). The producer only knows instruments by index.
 */
const BASE_SYMBOLS = [
  'ALFA',
  'BETA',
  'GAMA',
  'DELT',
  'EPSI',
  'ZETA',
  'ETAA',
  'THET',
  'IOTA',
  'KAPA',
  'LAMB',
  'MYUU',
  'NYUU',
  'XIII',
  'OMIC',
  'PIII',
  'RHOO',
  'SIGM',
  'TAUU',
  'UPSI',
  'PHII',
  'CHII',
  'PSII',
  'OMEG',
] as const;

/** Symbol for one instrument; after the 24 Greek letters a number is appended (ALFA2, BETA2, …). */
export function instrumentSymbol(index: number): string {
  const base = BASE_SYMBOLS[index % BASE_SYMBOLS.length];
  const round = Math.floor(index / BASE_SYMBOLS.length);
  return round === 0 ? base : `${base}${round + 1}`;
}

/** Two-letter avatar shown next to the symbol: "ALFA" → "AL". */
export function symbolAvatar(symbol: string): string {
  return symbol.slice(0, 2);
}
