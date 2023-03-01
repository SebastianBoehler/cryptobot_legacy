"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccount = exports.calculateProfit = exports.getHistoricalPrices = exports.getMarkets = void 0;
const ftx_api_1 = require("ftx-api");
const config_1 = __importDefault(require("../config/config"));
const FTXClient = new ftx_api_1.RestClient(config_1.default.FTX_KEY, config_1.default.FTX_SECRET);
async function getMarkets() {
    const respMarkets = await FTXClient.getMarkets();
    if (respMarkets['success'])
        return respMarkets['result'];
    else
        return [];
}
exports.getMarkets = getMarkets;
async function getHistoricalPrices(symbol, start_time) {
    const respHistorical = await FTXClient.getHistoricalPrices({
        market_name: symbol,
        resolution: 60,
        start_time
    });
    if (respHistorical['success'])
        return respHistorical['result'];
    else
        return [];
}
exports.getHistoricalPrices = getHistoricalPrices;
async function calculateProfit(entry, price, exit) {
    const feeDecimal = +(config_1.default.FTX_FEE || 0.000665);
    if (!entry)
        return {
            netProfit: 0,
            netProfitPercentage: 0,
            //exitInvestSize: 0,
            netInvest: 0
        };
    const type = entry['type'];
    if (type.includes('Exit'))
        return {
            netProfit: 0,
            netProfitPercentage: 0,
            //exitInvestSize: entry['invest'],
            netInvest: entry['netInvest']
        };
    const leverage = +(config_1.default.LEVERAGE || 5);
    const isLongOrder = type.includes('Long');
    const InvestSizeBrutto = isLongOrder ? entry['invest'] * (price / entry['price']) : entry['invest'] * (2 - price / entry['price']);
    const bruttoProfit = InvestSizeBrutto - entry['invest'];
    const fee = InvestSizeBrutto * feeDecimal;
    const priceChange = (price / entry['price'] - 1) * 100;
    const netProfit = bruttoProfit - (entry['fee'] + fee);
    const netProfitPercentage = netProfit / (entry['invest'] / leverage) * 100;
    const netInvest = entry['netInvest'] + netProfit;
    return {
        fee,
        feeSum: entry['fee'] + fee,
        bruttoProfit,
        netProfit,
        priceChange,
        netProfitPercentage,
        netInvest
    };
}
exports.calculateProfit = calculateProfit;
async function getAccount() {
    const acc = await FTXClient.getAccount();
    return acc['result'];
}
exports.getAccount = getAccount;
//# sourceMappingURL=utils.js.map