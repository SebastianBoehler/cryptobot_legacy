import { Exchanges, ExitOrderObject, OrderObject } from "./types/trading";

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
  info: (...params: any) =>
    console.log(`[INFO](${new Date().toLocaleTimeString()})`, ...params),
  error: (...params: any) =>
    console.error(`[ERROR](${new Date().toLocaleTimeString()})`, ...params),
  warn: (...params: any) =>
    console.warn(`[WARN](${new Date().toLocaleTimeString()})`, ...params),
  http: (...params: any) =>
    console.log(`[HTTP](${new Date().toLocaleTimeString()})`, ...params),
  debug: (...params: any) =>
    console.log(`[DEBUG](${new Date().toLocaleTimeString()})`, ...params),
};

interface BaseTrade {
  type: string;
  price: number;
  invest: number;
  netInvest: number;
  fee: number;
}

export async function calculateProfit<T extends BaseTrade>(
  exchange: Exchanges,
  lastTrade: T,
  price: number
) {
  if (!lastTrade)
    return {
      profit: 0,
      priceChangePercent: 0,
      fee: 0,
      netProfit: 0,
      netProfitInPercent: 0,
      netInvest: 0,
    };

  const isLong = lastTrade.type.includes("Long");

  const investSizeBrutto = isLong
    ? lastTrade.invest * (price / lastTrade.price)
    : lastTrade.invest * (2 - price / lastTrade.price);

  const fees = {
    binance: 0.00075,
    dydx: 0,
    coinbase: 0.003,
    kraken: 0.0026,
    okx: 0.0005,
  };

  const calcForEntry = lastTrade.type.includes("Exit");
  const invest = calcForEntry ? lastTrade.invest : investSizeBrutto;
  const fee = invest * fees[exchange];

  if (calcForEntry) {
    return {
      profit: 0,
      priceChangePercent: 0,
      fee,
      netProfit: 0,
      netProfitInPercent: 0,
      netInvest: lastTrade.netInvest,
    };
  }

  const priceChangePercent =
    ((price - lastTrade.price) / lastTrade.price) * 100;

  const bruttoProfit = investSizeBrutto - lastTrade.invest;

  const feeSum = Math.abs(lastTrade.fee) + Math.abs(fee);
  const netProfit = bruttoProfit - feeSum;
  const netProfitInPercent = (netProfit / lastTrade.netInvest) * 100;
  const profit = netProfit / lastTrade.invest;
  const netInvest = lastTrade.netInvest + netProfit;

  return {
    profit,
    netProfit,
    netProfitInPercent,
    priceChangePercent,
    fee,
    netInvest,
    feeSum,
  };
}

export function isExitOrder(order: OrderObject): order is ExitOrderObject {
  return order.type.includes("Exit");
}

export function calculateProfitForTrades(
  exits: ExitOrderObject[],
  filterFn: (exit: ExitOrderObject) => boolean = () => true
) {
  const filteredExits = exits.filter(filterFn);
  //sum up all profits
  const netProfit = filteredExits.reduce(
    (acc, exit) => acc + exit.netProfit,
    0
  );
  //multiply all profits
  const profit = filteredExits.reduce(
    (acc, exit) => acc * (exit.profit + 1),
    1
  );
  //multiply all net profits in percent
  const netProfitInPercent = filteredExits.reduce(
    (acc, exit) => acc * (exit.netProfitInPercent / 100 + 1),
    1
  );

  return {
    profit,
    netProfit,
    netProfitInPercent: (netProfitInPercent - 1) * 100,
  };
}

export function createUniqueId(length: number) {
  const chars =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = length; i > 0; --i)
    result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}
