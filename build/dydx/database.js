"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const v3_client_1 = require("@dydxprotocol/v3-client");
const date_fns_1 = require("date-fns");
const utils_1 = require("../utils");
const config_1 = __importDefault(require("../config/config"));
const index_1 = __importDefault(require("../mongodb/index"));
const client = new v3_client_1.DydxClient("https://api.dydx.exchange");
const startTime = (0, date_fns_1.subMonths)(new Date(), 3).getTime();
const mongo = new index_1.default("dydx");
async function main() {
    const { markets } = await client.public.getMarkets();
    let marketArray = Object.keys(markets);
    if (config_1.default.DYDX_ENABLED_PAIRS.length > 0)
        marketArray = marketArray.filter((item) => config_1.default.DYDX_ENABLED_PAIRS.includes(item));
    const chunks = (0, utils_1.createChunks)(marketArray, 5);
    async function runChunks() {
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
        await (0, utils_1.sleep)(1000 * 45);
        runChunks();
    }
    runChunks();
}
async function processSymbol(symbol) {
    const lastCandle = await mongo.readLastCandle(symbol);
    const lastCandleTime = lastCandle ? lastCandle.start : new Date(startTime);
    const secondsAgo = (new Date().getTime() - lastCandleTime.getTime()) / 1000;
    if (secondsAgo < 70)
        return;
    const { candles } = await client.public.getCandles({
        market: symbol,
        resolution: v3_client_1.CandleResolution.ONE_MIN,
        fromISO: new Date(lastCandleTime).toISOString(),
        toISO: new Date(lastCandleTime.getTime() + 1000 * 60 * 100).toISOString(),
    });
    if (!candles || candles.length === 0)
        return;
    if (!lastCandle) {
        utils_1.logger.info(`Creating unique index for ${symbol}`);
        await mongo.createUniqueIndex(symbol, "start");
    }
    console.log(`Loaded ${candles.length} candles for ${symbol}`, lastCandle?.start);
    const formatted = candles
        .map((candle) => {
        return {
            high: candle.high,
            low: candle.low,
            open: candle.open,
            close: candle.close,
            volume: candle.usdVolume,
            start: new Date(candle.startedAt),
        };
    })
        .filter((candle) => candle.start.getTime() > lastCandleTime.getTime() &&
        candle.start.getTime() < (0, date_fns_1.subMinutes)(new Date(), 1).getTime());
    await mongo.writeMany(symbol, formatted);
}
main();
//# sourceMappingURL=database.js.map