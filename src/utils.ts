import BigNumber from "bignumber.js";
import {
  BaseBacktestOptions,
  Exchanges,
  ExitOrderObject,
  OrderObject,
} from "./types/trading";

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
  //silly: (...params: any) =>
  //console.log(`[SILLY](${new Date().toLocaleTimeString()})`, ...params),
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

  const executedOrders =
    filteredExits.filter((exit) => exit.canExecuteOrder).length /
    filteredExits.length;

  return {
    profit,
    netProfit,
    netProfitInPercent: (netProfitInPercent - 1) * 100,
    executedOrders,
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

export function toDecimals(value: number, decimals: number) {
  const arr = Number(value)
    .toString()
    .match(new RegExp("^-?\\d+(?:.\\d{0," + decimals + "})?"))!;
  return +arr[0];
}

export function calculateLineOfBestFit(array: number[]) {
  const x = array.map((_, i) => i);
  const y = array;

  const xSum = x.reduce((acc, val) => acc + val, 0);
  const ySum = y.reduce((acc, val) => acc + val, 0);

  const xSquaredSum = x.reduce((acc, val) => acc + val * val, 0);
  const xySum = x.reduce((acc, val, i) => acc + val * y[i], 0);

  const m =
    (array.length * xySum - xSum * ySum) /
    (array.length * xSquaredSum - xSum * xSum);
  const b = (ySum - m * xSum) / array.length;

  const lineOfBestFit = x.map((xVal) => m * xVal + b);

  return lineOfBestFit;
}

export const checkHasOpenPosition = (
  lastTrade?: OrderObject
): lastTrade is OrderObject => {
  return lastTrade ? lastTrade.type.includes("Entry") : false;
};

export const calculateBacktestResult = (
  trades: OrderObject[],
  startCapital: number
) => {
  const exits = trades.filter(isExitOrder);
  const holdDurations = exits.map((exit) => exit.holdDuration);
  const avgHoldDuration =
    holdDurations.reduce((a, b) => a + b, 0) / exits.length;
  const netProfits = exits.map((exit) => new BigNumber(exit.netProfit));
  const sumProfit = netProfits.reduce((a, b) => a.plus(b), BigNumber(0));
  const netProfitInPercent = sumProfit
    .dividedBy(startCapital)
    .multipliedBy(100)
    .toNumber();
  const gotLiquidated = exits.some((trade) => trade.isLiquidated);

  const executedOrders =
    trades.filter((trade) => trade.canExecuteOrder).length / trades.length;

  const shorts = exits.filter((exit) => exit.type === "Short Exit");
  const longs = exits.filter((exit) => exit.type === "Long Exit");
  const shortLongRatio = `${((shorts.length / exits.length) * 100).toFixed(
    0
  )}/${((longs.length / exits.length) * 100).toFixed(0)}`;

  //calculate profit in timeframes
  //per month
  const months = [
    ...new Set(
      exits.map(({ timestamp }) =>
        timestamp.toLocaleString("default", { month: "long" })
      )
    ),
  ];
  const profitInMonth = months.map((month) => {
    return {
      ...calculateProfitForTrades(
        exits,
        ({ timestamp }) =>
          timestamp.toLocaleString("default", { month: "long" }) === month
      ),
      key: month,
    };
  });

  const successRate =
    exits.filter((exit) => exit.profit > 0).length / exits.length;

  const lineOfBestFit = calculateLineOfBestFit(
    exits.map((exit) => exit.netInvest)
  );

  //avg timeInLoss
  const avgTimeInLoss =
    exits.reduce((acc, exit) => acc + exit.timeInLoss, 0) / exits.length;
  const avgTimeInLossInPercent =
    exits.reduce((acc, exit) => acc + exit.timeInLossInPercent, 0) /
    exits.length;

  const result: BaseBacktestOptions = {
    successRate,
    timestamp: new Date(),
    startCapital,
    trades,
    netProfit: sumProfit.toFormat(2),
    netProfitInPercent: netProfitInPercent,
    avgHoldDuration,
    profitInMonth,
    gotLiquidated,
    shortLongRatio,
    executedOrders,
    lineOfBestFit,
    avgTimeInLoss,
    avgTimeInLossInPercent,
  };

  return result;
};
