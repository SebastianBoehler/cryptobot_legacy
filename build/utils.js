"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateProfit = exports.logger = exports.createChunks = exports.sleep = void 0;
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
    info: (message, ...data) => console.log(`[INFO](${new Date().toLocaleTimeString()})`, message, ...data),
    error: (message, ...data) => console.error(`[ERROR](${new Date().toLocaleTimeString()})`, message, ...data),
    warn: (message, ...data) => console.warn(`[WARN](${new Date().toLocaleTimeString()})`, message, ...data),
    http: (message, ...data) => console.log(`[HTTP](${new Date().toLocaleTimeString()})`, message, ...data),
    debug: (message, ...data) => console.log(`[DEBUG](${new Date().toLocaleTimeString()})`, message, ...data),
};
async function calculateProfit(exchange, lastTrade, price, leverage) {
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
exports.calculateProfit = calculateProfit;
//# sourceMappingURL=utils.js.map