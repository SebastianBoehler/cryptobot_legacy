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
  lastTrade: OrderObject,
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

  const netProfit = bruttoProfit - (lastTrade.fee + fee);
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
  const profit = filteredExits.reduce((acc, exit) => acc + exit.profit, 0);
  const netProfit = filteredExits.reduce(
    (acc, exit) => acc + exit.netProfit,
    0
  );
  const netProfitInPercent = filteredExits.reduce(
    (acc, exit) => acc + exit.netProfitInPercent,
    0
  );
  return {
    profit,
    netProfit,
    netProfitInPercent,
  };
}
