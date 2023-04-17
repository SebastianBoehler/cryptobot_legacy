export type Rule = {
  long_entry: boolean[][];
  long_exit: boolean[][];
  short_entry: boolean[][];
  short_exit: boolean[][];
  noStrictVolume?: boolean;
};

export type Exchanges = "binance" | "coinbase" | "dydx" | "kraken" | "okx";

type EntryOrderTypes = "Long Entry" | "Short Entry";
type ExitOrderTypes = "Long Exit" | "Short Exit";
export type OrderTypes = EntryOrderTypes | ExitOrderTypes;

export interface EntryOrderObject {
  price: number;
  timestamp: Date;
  type: EntryOrderTypes;
  platform: Exchanges;
  invest: number;
  netInvest: number;
  fee: number;
  holdDuration: number;
  details: Record<string, unknown>;
  //live trading
  clOrderId?: string;
  spread?: number;
}

export interface ExitOrderObject extends Omit<EntryOrderObject, "type"> {
  type: ExitOrderTypes;
  priceChangePercent: number;
  netProfitInPercent: number;
  netProfit: number;
  profit: number;
  highestPrice?: number;
  lowestPrice?: number;
  isLiquidated: boolean;
}

export type OrderObject = EntryOrderObject | ExitOrderObject;

export interface BacktestingResult {
  successRate: number;
  timestamp: Date;
  strategyName: string;
  exchange: Exchanges;
  startCapital: number;
  symbol: string;
  trades: OrderObject[];
  netProfit: string;
  netProfitInPercent: number;
  start: Date;
  end: Date;
  avgHoldDuration: number;
  leverage: number;
  hodlProfitInPercent: number;
  profitInMonth: {
    profit: number;
    netProfit: number;
    netProfitInPercent: number;
    key: string | number;
  }[];
  gotLiquidated: boolean;
}

export interface Indicators {
  ema_8: number;
  ema_13: number;
  ema_21: number;
  ema_55: number;
  bollinger_bands: {
    upper: number;
    middle: number;
    lower: number;
  };
  MACD: {
    macd: number;
    emaFast: number;
    emaSlow: number;
    signal: number;
    histogram: number;
  };
  vol: number;
  RSI: number;
  ADX: { adx: number; pdi: number; mdi: number };
}
