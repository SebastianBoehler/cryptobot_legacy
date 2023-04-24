"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkHasOpenPosition = exports.calculateLineOfBestFit = exports.toDecimals = exports.createUniqueId = exports.calculateProfitForTrades = exports.isExitOrder = exports.calculateProfit = exports.logger = exports.createChunks = exports.sleep = void 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
exports.sleep = sleep;
const createChunks = (array, chunkSize) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
};
exports.createChunks = createChunks;
exports.logger = {
    info: (...params) => console.log(`[INFO](${new Date().toLocaleTimeString()})`, ...params),
    error: (...params) => console.error(`[ERROR](${new Date().toLocaleTimeString()})`, ...params),
    warn: (...params) => console.warn(`[WARN](${new Date().toLocaleTimeString()})`, ...params),
    http: (...params) => console.log(`[HTTP](${new Date().toLocaleTimeString()})`, ...params),
    debug: (...params) => console.log(`[DEBUG](${new Date().toLocaleTimeString()})`, ...params),
};
async function calculateProfit(exchange, lastTrade, price) {
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
    const priceChangePercent = ((price - lastTrade.price) / lastTrade.price) * 100;
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
exports.calculateProfit = calculateProfit;
function isExitOrder(order) {
    return order.type.includes("Exit");
}
exports.isExitOrder = isExitOrder;
function calculateProfitForTrades(exits, filterFn = () => true) {
    const filteredExits = exits.filter(filterFn);
    //sum up all profits
    const netProfit = filteredExits.reduce((acc, exit) => acc + exit.netProfit, 0);
    //multiply all profits
    const profit = filteredExits.reduce((acc, exit) => acc * (exit.profit + 1), 1);
    //multiply all net profits in percent
    const netProfitInPercent = filteredExits.reduce((acc, exit) => acc * (exit.netProfitInPercent / 100 + 1), 1);
    const executedOrders = filteredExits.filter((exit) => exit.canExecuteOrder).length /
        filteredExits.length;
    return {
        profit,
        netProfit,
        netProfitInPercent: (netProfitInPercent - 1) * 100,
        executedOrders,
    };
}
exports.calculateProfitForTrades = calculateProfitForTrades;
function createUniqueId(length) {
    const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let result = "";
    for (let i = length; i > 0; --i)
        result += chars[Math.floor(Math.random() * chars.length)];
    return result;
}
exports.createUniqueId = createUniqueId;
function toDecimals(value, decimals) {
    const arr = Number(value)
        .toString()
        .match(new RegExp("^-?\\d+(?:.\\d{0," + decimals + "})?"));
    return +arr[0];
}
exports.toDecimals = toDecimals;
function calculateLineOfBestFit(array) {
    const x = array.map((_, i) => i);
    const y = array;
    const xSum = x.reduce((acc, val) => acc + val, 0);
    const ySum = y.reduce((acc, val) => acc + val, 0);
    const xSquaredSum = x.reduce((acc, val) => acc + val * val, 0);
    const xySum = x.reduce((acc, val, i) => acc + val * y[i], 0);
    const m = (array.length * xySum - xSum * ySum) /
        (array.length * xSquaredSum - xSum * xSum);
    const b = (ySum - m * xSum) / array.length;
    const lineOfBestFit = x.map((xVal) => m * xVal + b);
    return lineOfBestFit;
}
exports.calculateLineOfBestFit = calculateLineOfBestFit;
const checkHasOpenPosition = (lastTrade) => {
    return lastTrade ? lastTrade.type.includes("Entry") : false;
};
exports.checkHasOpenPosition = checkHasOpenPosition;
//# sourceMappingURL=utils.js.map