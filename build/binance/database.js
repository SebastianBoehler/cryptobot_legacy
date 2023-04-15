"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const binance_1 = require("binance");
const config_1 = __importDefault(require("../config/config"));
const utils_1 = require("../utils");
const mongodb_1 = __importDefault(require("../mongodb"));
const date_fns_1 = require("date-fns");
const startTime = (0, date_fns_1.subMonths)(new Date(), 3).getTime();
const mongo = new mongodb_1.default("binance");
const client = new binance_1.MainClient({
    api_key: config_1.default.BINANCE_API_KEY,
    api_secret: config_1.default.BINANCE_API_SECRET,
});
async function main() {
    const markets = await client.getExchangeInfo();
    const symbols = markets.symbols
        .filter((market) => config_1.default.BN_ENABLED_PAIRS.length === 0 ||
        (config_1.default.BN_ENABLED_PAIRS.includes(market.symbol) &&
            market.status === "TRADING" &&
            market.isSpotTradingAllowed))
        .map((symbol) => symbol.symbol);
    const chunksOfSymbols = (0, utils_1.createChunks)(symbols, 20);
    utils_1.logger.info("symbols", symbols.length, symbols);
    while (true) {
        for (const chunk of chunksOfSymbols) {
            try {
                const result = await Promise.allSettled(chunk.map(processSymbol));
                utils_1.logger.info(`Successfully updated ${result.filter((r) => r.status === "fulfilled").length} symbols`);
            }
            catch (error) {
                utils_1.logger.error(error);
            }
            finally {
                await (0, utils_1.sleep)(1000 * 5);
            }
        }
    }
}
async function processSymbol(symbol) {
    const lastCandle = await mongo.readLastCandle(symbol);
    const lastCandleTime = lastCandle ? lastCandle.start : new Date(startTime);
    const secondsAgo = (new Date().getTime() - lastCandleTime.getTime()) / 1000;
    if (secondsAgo < 70)
        return;
    const candles = await client.getKlines({
        symbol,
        interval: "1m",
        limit: 1000,
        startTime: lastCandle?.start.getTime() || startTime,
    });
    if (candles.length === 0)
        return;
    if (!lastCandle) {
        utils_1.logger.info(`Creating unique index for ${symbol}`);
        await mongo.createUniqueIndex(symbol, "openTime");
    }
    utils_1.logger.info(`Loaded ${candles.length} candles for ${symbol}`);
    const formatted = candles.map((candle) => ({
        start: new Date(candle[0]),
        open: candle[1] + "",
        high: candle[2] + "",
        low: candle[3] + "",
        close: candle[4] + "",
        volume: candle[5] + "",
        //closeTime: new Date(candle[6]),
        //quoteAssetVolume: candle[7],
        //numberOfTrades: candle[8],
        //takerBuyBaseAssetVolume: candle[9],
        //takerBuyQuoteAssetVolume: candle[10],
        //ignore: candle[11],
    }));
    const filtered = formatted.filter(({ start }) => start.getTime() > (lastCandle?.start.getTime() || 0) &&
        start.getTime() < (0, date_fns_1.subMinutes)(new Date(), 1).getTime());
    utils_1.logger.info(`Writing ${filtered.length} candles to ${symbol}`);
    if (filtered.length > 0)
        await mongo.writeMany(symbol, filtered);
}
main();
//# sourceMappingURL=database.js.map