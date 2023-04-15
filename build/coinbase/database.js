"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const mongodb_1 = __importDefault(require("../mongodb"));
const date_fns_1 = require("date-fns");
const utils_2 = require("../utils");
const config_1 = __importDefault(require("../config/config"));
const startTime = (0, date_fns_1.subMonths)(new Date(), 3).getTime();
const client = new utils_1.CoinbaseAdvanced(config_1.default.CB_API_KEY);
const mongo = new mongodb_1.default("coinbase");
async function main() {
    const products = await client.listProducts();
    let symbols = products.map((item) => item.product_id);
    if (config_1.default.CB_ENABLED_PAIRS.length > 0)
        symbols = symbols.filter((item) => config_1.default.CB_ENABLED_PAIRS.includes(item));
    const chunks = (0, utils_2.createChunks)(symbols, 5);
    while (true) {
        for (const chunk of chunks) {
            try {
                const result = await Promise.allSettled(chunk.map(processSymbol));
                utils_2.logger.info(`Successfully updated ${result.filter((r) => r.status === "fulfilled").length} symbols`);
            }
            catch (error) {
                utils_2.logger.error(error);
            }
            finally {
                await (0, utils_2.sleep)(1000);
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
    //logger.info('lastCandle', new Date(lastCandle ? addMinutes(lastCandle.start, 1) : startTime).toString(), lastCandle)
    const candles = await client.getKlines({
        symbol,
        interval: "ONE_MINUTE",
        startTime: (0, date_fns_1.getUnixTime)(lastCandle ? (0, date_fns_1.addMinutes)(lastCandle.start, 1) : startTime),
        endTime: (0, date_fns_1.getUnixTime)(lastCandle
            ? (0, date_fns_1.addMinutes)(lastCandle.start, 101)
            : (0, date_fns_1.addMinutes)(startTime, 100)),
    });
    if (!candles || candles.length === 0)
        return;
    utils_2.logger.info(`Loaded ${candles.length} candles for ${symbol}`);
    const formatted = candles
        .filter((item) => +item.start > (0, date_fns_1.getUnixTime)(lastCandle?.start || 0) &&
        +item.start < (0, date_fns_1.getUnixTime)((0, date_fns_1.subMinutes)(new Date(), 1)))
        .map((candle) => {
        return {
            ...candle,
            start: new Date(candle.start * 1000),
        };
    });
    if (formatted.length > 0) {
        if (!lastCandle) {
            utils_2.logger.info(`Creating unique index for ${symbol}`);
            await mongo.createUniqueIndex(symbol, "start");
        }
        await mongo.writeMany(symbol, formatted);
    }
}
main();
//# sourceMappingURL=database.js.map