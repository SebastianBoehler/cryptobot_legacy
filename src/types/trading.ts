import { GeneratedCandle } from "../mongodb/types";

export type Rule = {
  long_entry: boolean[][];
  long_exit: boolean[][];
  short_entry: boolean[][];
  short_exit: boolean[][];
  noStrictVolume?: boolean;
  saveProfits?: boolean;
};

export type Exchanges = "binance" | "coinbase" | "dydx" | "kraken" | "okx";

export type EntryOrderTypes = "Long Entry" | "Short Entry";
type ExitOrderTypes = "Long Exit" | "Short Exit";
export type OrderTypes = EntryOrderTypes | ExitOrderTypes;

export interface BaseOrderObject {
  timestamp: Date;
  platform: Exchanges;
  invest: number;
  netInvest: number;
  portfolio: number;
  clOrdId?: string;
  leverage?: number;
  details: Record<string, unknown>;
  spread?: number;
  canExecuteOrder?: boolean;
}

export interface EntryOrderObject extends BaseOrderObject {
  price: number;
  type: EntryOrderTypes;
  fee: number;
  holdDuration: number;
  //trading
  positionSize?: number;
  netPositionSize?: number;
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
  timeInLoss: number;
  timeInLossInPercent: number;
}

export type OrderObject = EntryOrderObject | ExitOrderObject;

export interface BaseBacktestOptions {
  successRate: number;
  timestamp: Date;
  startCapital: number;
  trades: OrderObject[];
  netProfit: string;
  netProfitInPercent: number;
  avgHoldDuration: number;
  profitInMonth: {
    profit: number;
    netProfit: number;
    netProfitInPercent: number;
    executedOrders: number;
    key: string | number;
  }[];
  gotLiquidated: boolean;
  shortLongRatio: string;
  executedOrders: number;
  lineOfBestFit: number[];
  avgTimeInLoss: number;
  avgTimeInLossInPercent: number;
}

export interface BacktestingResult extends BaseBacktestOptions {
  strategyName: string;
  exchange: Exchanges;
  symbol: string;
  start: Date;
  end: Date;
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
  ATR: number;
  candle: GeneratedCandle | null;
  stochRSI: { k: number; d: number };
}
