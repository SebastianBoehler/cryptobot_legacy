import { Exchanges, orderObject } from "./types/trading";

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const createChunks = <T>(array: T[], chunkSize: number): T[][] => {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

export const logger = {
  info: (message: any, ...data: any) =>
    console.log(`[INFO](${new Date().toLocaleTimeString()})`, message, ...data),
  error: (message: any, ...data: any) =>
    console.error(
      `[ERROR](${new Date().toLocaleTimeString()})`,
      message,
      ...data
    ),
  warn: (message: any, ...data: any) =>
    console.warn(
      `[WARN](${new Date().toLocaleTimeString()})`,
      message,
      ...data
    ),
  http: (message: any, ...data: any) =>
    console.log(`[HTTP](${new Date().toLocaleTimeString()})`, message, ...data),
  debug: (message: any, ...data: any) =>
    console.log(
      `[DEBUG](${new Date().toLocaleTimeString()})`,
      message,
      ...data
    ),
};

export async function calculateProfit(
  exchange: Exchanges,
  lastTrade: orderObject,
  price: number,
  leverage: number
) {
  if (!lastTrade || lastTrade.type.includes("Exit"))
    return {
      profit: 0,
      priceChangePercent: 0,
      fee: 0,
      netProfit: 0,
      netProfitInPercent: 0,
      netInvest: 0,
    };

  const fees = {
    binance: 0.00075,
    dydx: 0,
    coinbase: 0.003,
  };

  const { invest } = lastTrade;

  const priceChangePercent = (price - lastTrade.price) / lastTrade.price;
  const isLong = lastTrade.type.includes("Long");

  const investSizeBrutto = isLong
    ? lastTrade.invest * (price / lastTrade.price)
    : lastTrade.invest * (2 - price / lastTrade.price);
  const bruttoProfit = investSizeBrutto - lastTrade.invest;
  const fee = investSizeBrutto * fees[exchange];

  const netProfit = bruttoProfit - (lastTrade.fee + fee);
  const netProfitInPercent = (netProfit / (invest * leverage)) * 100;
  const profit = netProfit / invest;
  const netInvest = lastTrade.invest + netProfit;

  return {
    profit,
    netProfit,
    netProfitInPercent,
    priceChangePercent,
    fee,
    netInvest,
  };
}
