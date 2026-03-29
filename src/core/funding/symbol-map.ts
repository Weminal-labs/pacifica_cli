// ---------------------------------------------------------------------------
// Symbol Mapping: Pacifica <> Binance <> Bybit
// ---------------------------------------------------------------------------
// Maps perpetual contract symbols across exchanges so funding rates can be
// compared side by side.  Pacifica uses uppercase without suffix (e.g. "BTC"),
// Binance uses "BTCUSDT", and Bybit uses "BTCUSDT".
// ---------------------------------------------------------------------------

export interface SymbolMapping {
  pacifica: string;
  binance: string;
  bybit: string;
}

// ---------------------------------------------------------------------------
// Known mappings (covers most liquid perps)
// ---------------------------------------------------------------------------

const SYMBOL_MAP: SymbolMapping[] = [
  { pacifica: "BTC",  binance: "BTCUSDT",  bybit: "BTCUSDT"  },
  { pacifica: "ETH",  binance: "ETHUSDT",  bybit: "ETHUSDT"  },
  { pacifica: "SOL",  binance: "SOLUSDT",  bybit: "SOLUSDT"  },
  { pacifica: "ARB",  binance: "ARBUSDT",  bybit: "ARBUSDT"  },
  { pacifica: "OP",   binance: "OPUSDT",   bybit: "OPUSDT"   },
  { pacifica: "AVAX", binance: "AVAXUSDT", bybit: "AVAXUSDT" },
  { pacifica: "DOGE", binance: "DOGEUSDT", bybit: "DOGEUSDT" },
  { pacifica: "MATIC",binance: "MATICUSDT",bybit: "MATICUSDT"},
  { pacifica: "LINK", binance: "LINKUSDT", bybit: "LINKUSDT" },
  { pacifica: "WIF",  binance: "WIFUSDT",  bybit: "WIFUSDT"  },
  { pacifica: "PEPE", binance: "PEPEUSDT", bybit: "PEPEUSDT" },
  { pacifica: "SUI",  binance: "SUIUSDT",  bybit: "SUIUSDT"  },
  { pacifica: "APT",  binance: "APTUSDT",  bybit: "APTUSDT"  },
  { pacifica: "NEAR", binance: "NEARUSDT", bybit: "NEARUSDT" },
  { pacifica: "FTM",  binance: "FTMUSDT",  bybit: "FTMUSDT"  },
  { pacifica: "INJ",  binance: "INJUSDT",  bybit: "INJUSDT"  },
  { pacifica: "TIA",  binance: "TIAUSDT",  bybit: "TIAUSDT"  },
  { pacifica: "SEI",  binance: "SEIUSDT",  bybit: "SEIUSDT"  },
  { pacifica: "JUP",  binance: "JUPUSDT",  bybit: "JUPUSDT"  },
  { pacifica: "W",    binance: "WUSDT",    bybit: "WUSDT"    },
  { pacifica: "RENDER",binance: "RENDERUSDT",bybit: "RENDERUSDT"},
  { pacifica: "STX",  binance: "STXUSDT",  bybit: "STXUSDT"  },
  { pacifica: "ATOM", binance: "ATOMUSDT", bybit: "ATOMUSDT" },
  { pacifica: "DOT",  binance: "DOTUSDT",  bybit: "DOTUSDT"  },
  { pacifica: "ADA",  binance: "ADAUSDT",  bybit: "ADAUSDT"  },
];

// ---------------------------------------------------------------------------
// Lookup indexes (built once on first use)
// ---------------------------------------------------------------------------

let byPacifica: Map<string, SymbolMapping> | undefined;
let byBinance: Map<string, SymbolMapping> | undefined;
let byBybit: Map<string, SymbolMapping> | undefined;

function ensureIndexes(): void {
  if (byPacifica) return;
  byPacifica = new Map();
  byBinance = new Map();
  byBybit = new Map();
  for (const m of SYMBOL_MAP) {
    byPacifica.set(m.pacifica.toUpperCase(), m);
    byBinance.set(m.binance.toUpperCase(), m);
    byBybit.set(m.bybit.toUpperCase(), m);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get the full symbol mapping for a Pacifica symbol. */
export function getMapping(pacificaSymbol: string): SymbolMapping | undefined {
  ensureIndexes();
  return byPacifica!.get(pacificaSymbol.toUpperCase());
}

/** Convert a Pacifica symbol to a Binance symbol. */
export function toBinanceSymbol(pacificaSymbol: string): string | undefined {
  return getMapping(pacificaSymbol)?.binance;
}

/** Convert a Pacifica symbol to a Bybit symbol. */
export function toBybitSymbol(pacificaSymbol: string): string | undefined {
  return getMapping(pacificaSymbol)?.bybit;
}

/**
 * Auto-generate a Binance symbol from a Pacifica symbol when no explicit
 * mapping exists.  Falls back to appending "USDT".
 */
export function toBinanceSymbolFallback(pacificaSymbol: string): string {
  return toBinanceSymbol(pacificaSymbol) ?? `${pacificaSymbol.toUpperCase()}USDT`;
}

/**
 * Auto-generate a Bybit symbol from a Pacifica symbol when no explicit
 * mapping exists.  Falls back to appending "USDT".
 */
export function toBybitSymbolFallback(pacificaSymbol: string): string {
  return toBybitSymbol(pacificaSymbol) ?? `${pacificaSymbol.toUpperCase()}USDT`;
}

/** Get all known symbol mappings. */
export function getAllMappings(): SymbolMapping[] {
  return [...SYMBOL_MAP];
}
