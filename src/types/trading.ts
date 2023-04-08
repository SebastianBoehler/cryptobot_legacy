export type Rule = {
  long_entry: boolean[][];
  long_exit: boolean[][];
  short_entry: boolean[][];
  short_exit: boolean[][];
  noStrictVolume?: boolean;
};

export type OrderTypes =
  | "Long Entry"
  | "Long Exit"
  | "Short Entry"
  | "Short Exit";

export type Exchanges = "binance" | "coinbase" | "dydx";

export type orderObject = {
  price: number;
  timestamp: Date;
  type: OrderTypes;
  platform: Exchanges;
  invest: number;
  netInvest: number;
  priceChangePercent: number;
  netProfitInPercent: number;
  netProfit: number;
  profit: number;
  fee: number;
  holdDuration: number;
  details: Record<string, unknown>;
};

export interface BacktestingResult {
  successRate: number;
  timestamp: Date;
  strategyName: string;
  exchange: Exchanges;
  startCapital: number;
  symbol: string;
  trades: orderObject[];
  netProfit: string;
  netProfitInPercent: number;
  start: Date;
  end: Date;
  avgHoldDuration: number;
  leverage: number;
  hodlProfitInPercent: number;
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
