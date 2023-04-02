"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const date_fns_1 = require("date-fns");
const generateIndicators_1 = require("../generateIndicators");
const mongodb_1 = __importDefault(require("../mongodb"));
const utils_1 = require("../utils");
const mongoClient = new mongodb_1.default("worker");
const startTime = new Date("2022-12-01T00:10:00.000Z");
async function main() {
    const systemDatabases = [
        "admin",
        "config",
        "local",
        "backtests",
        "binance",
        "coinbase",
    ];
    const { databases } = await mongoClient.listDatabases();
    const exchanges = databases.filter((db) => !systemDatabases.includes(db.name));
    outerLoop: for (const exchange of exchanges) {
        const collections = await mongoClient.existingCollections(exchange.name);
        for (const symbol of collections) {
            utils_1.logger.info(`Processing ${exchange.name}#${symbol}`);
            const identifier = `${exchange.name}#${symbol}`;
            const indicators = {
                "25min": new generateIndicators_1.generateIndicators(exchange.name, symbol, 25),
                "60min": new generateIndicators_1.generateIndicators(exchange.name, symbol, 60),
                "90min": new generateIndicators_1.generateIndicators(exchange.name, symbol, 90),
                "4h": new generateIndicators_1.generateIndicators(exchange.name, symbol, 60 * 4),
                //"8h": new generateIndicators(exchange.name, symbol, 60 * 8),
            };
            const lastEntry = await mongoClient.getLatestEntry("worker", identifier, "timestamp");
            if (lastEntry) {
                await mongoClient.createUniqueIndex(identifier, "timestamp", exchange.name);
            }
            const lastEntryTimestamp = lastEntry?.timestamp || startTime;
            const ago = (0, date_fns_1.subHours)(new Date(), 1);
            //last entry is less than 1 hour ago
            if (lastEntryTimestamp > ago) {
                utils_1.logger.info("continue");
                continue;
            }
            const timestamp = (0, date_fns_1.addHours)(lastEntryTimestamp, 1);
            const array = Array.from({ length: 2500 }, (_, i) => i).slice(1);
            const timestamps = array
                .map((i) => (0, date_fns_1.subMinutes)(timestamp, 25 * i))
                .reverse();
            for (const date of timestamps) {
                await Promise.all([
                    indicators["25min"].getIndicators(date.getTime()),
                    indicators["60min"].getIndicators(date.getTime()),
                    indicators["90min"].getIndicators(date.getTime()),
                    indicators["4h"].getIndicators(date.getTime()),
                    //indicators["8h"].getIndicators(date.getTime()),
                ]);
            }
            const [indicators_25min, indicators_60min, indicators_90min, indicators_4h,
            //indicators_8h,
            ] = await Promise.all([
                indicators["25min"].getIndicators(timestamp.getTime()),
                indicators["60min"].getIndicators(timestamp.getTime()),
                indicators["90min"].getIndicators(timestamp.getTime()),
                indicators["4h"].getIndicators(timestamp.getTime()),
                //indicators["8h"].getIndicators(timestamp.getTime()),
            ]);
            const data = {
                timestamp: new Date(),
                indicators: {
                    "25min": indicators_25min,
                    "60min": indicators_60min,
                    "90min": indicators_90min,
                    "4h": indicators_4h,
                    //"8h": indicators_8h,
                },
                symbol,
                exchange: exchange.name,
                identifier,
            };
            await mongoClient.write(data, identifier, "worker");
        }
    }
}
main();
//# sourceMappingURL=index.js.map