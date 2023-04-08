"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../utils");
const utils_2 = __importDefault(require("./utils"));
const index_1 = __importDefault(require("../mongodb/index"));
const date_fns_1 = require("date-fns");
const client = new utils_2.default();
const mongo = new index_1.default("kraken");
const startTime = (0, date_fns_1.subMonths)(new Date(), 3).getTime();
async function processSymbol(symbol) {
    const lastCandle = (await mongo.readLastCandle(symbol, "start"));
    const lastCandleTime = lastCandle ? lastCandle.start : new Date(startTime);
    const secondsAgo = (new Date().getTime() - lastCandleTime.getTime()) / 1000;
    if (secondsAgo < 70)
        return;
    utils_1.logger.info(`Loading candles since ${lastCandleTime} for ${symbol}`);
    const candles = await client.getOHLCdata(symbol, 1, lastCandleTime);
    if (!candles || candles.length === 0)
        return;
    utils_1.logger.debug(`Earliest candle: ${new Date(candles[0][0] * 1000)}}`);
    utils_1.logger.debug(`Latest candle: ${new Date(candles[candles.length - 1][0] * 1000)}}`);
    if (!lastCandle) {
        utils_1.logger.info(`Creating unique index for ${symbol}`);
        await mongo.createUniqueIndex(symbol, "start");
    }
    const data = candles
        .map((candle) => {
        return {
            high: candle[2],
            low: candle[3],
            open: candle[1],
            close: candle[4],
            volume: candle[6],
            start: new Date(candle[0] * 1000),
        };
    })
        .filter((candle) => candle.start.getTime() > lastCandleTime.getTime() &&
        candle.start.getTime() < (0, date_fns_1.subMinutes)(new Date(), 1).getTime());
    await mongo.writeMany(symbol, data);
}
async function main() {
    const pairs = await client.getTradablePairs();
    const symbols = Object.keys(pairs);
    const chunks = (0, utils_1.createChunks)(symbols, 5);
    while (true) {
        for (const chunk of chunks) {
            try {
                const result = await Promise.allSettled(chunk.map(processSymbol));
                utils_1.logger.info(`Successfully updated ${result.filter((r) => r.status === "fulfilled").length} symbols`);
            }
            catch (error) {
                utils_1.logger.error(error);
            }
            finally {
                await (0, utils_1.sleep)(1000);
            }
        }
    }
}
main();
//# sourceMappingURL=database.js.map