"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const date_fns_1 = require("date-fns");
const config_1 = __importDefault(require("./config/config"));
const generateIndicators_1 = require("./generateIndicators");
const index_1 = __importDefault(require("./mongodb/index"));
const utils_1 = require("./utils");
const bignumber_js_1 = __importDefault(require("bignumber.js"));
const mongoClient = new index_1.default("admin");
bignumber_js_1.default.config({
    FORMAT: {
        groupSeparator: ",",
        decimalSeparator: ".",
        groupSize: 3,
    },
});
const exchangeConfigs = {
    binance: {
        derivatesEnabled: false,
    },
    dydx: {
        derivatesEnabled: true,
    },
    coinbase: {
        derivatesEnabled: false,
    },
    kraken: {
        derivatesEnabled: true,
    },
    okx: {
        derivatesEnabled: true,
    },
};
async function backtester(exchange, symbol) {
    const strategyNames = ["1", "2", "3", "4", "5", "6", "7", "8"]; //as const;
    const exchangeConfig = exchangeConfigs[exchange];
    const leverage = exchangeConfig.derivatesEnabled ? config_1.default.LEVERAGE || 5 : 1;
    const history = await mongoClient.getTimeAndClose(exchange, symbol);
    const startAndEndDates = await mongoClient.getStartAndEndDates(exchange, symbol);
    if (!startAndEndDates)
        return;
    const { start, end } = startAndEndDates;
    const storage = {};
    const startCapital = 1_500;
    const indicators = {
        "25min": new generateIndicators_1.generateIndicators(exchange, symbol, 25),
        "60min": new generateIndicators_1.generateIndicators(exchange, symbol, 60),
        "2h": new generateIndicators_1.generateIndicators(exchange, symbol, 60 * 2),
    };
    const startOffest = 60 * 12;
    outerLoop: for (let i = startOffest; i < Infinity; i++) {
        const timestamp = (0, date_fns_1.addMinutes)(start, i);
        if (timestamp.getTime() >= end.getTime())
            break;
        //get candle form history and if not available get time<timestamp candle from db
        let candle = history.find(({ start }) => start?.getTime() === timestamp.getTime());
        if (!candle)
            throw new Error("Candle not found");
        const { close, volume } = candle;
        utils_1.logger.debug(timestamp, exchange, symbol, exchangeConfig.derivatesEnabled);
        const [indicators_25min, indicators_60min, indicators_2h] = await Promise.all([
            indicators["25min"].getIndicators(timestamp.getTime()),
            indicators["60min"].getIndicators(timestamp.getTime()),
            indicators["2h"].getIndicators(timestamp.getTime()),
        ]);
        if (startOffest * 2 > i)
            continue;
        const prev_indicators_25min = indicators["25min"].prevValues;
        const prev_indicators_60min = indicators["60min"].prevValues;
        const prev_indicators_2h = indicators["2h"].prevValues;
        for (const strategyName of strategyNames) {
            if (!storage[strategyName])
                storage[strategyName] = {
                    trades: [],
                    indexes: {
                        long_entry: 0,
                        long_exit: 0,
                        short_entry: 0,
                        short_exit: 0,
                    },
                };
            const trades = storage[strategyName].trades;
            const lastTrade = trades[trades.length - 1];
            const hasOpenPosition = lastTrade?.type.includes("Entry");
            const { profit, priceChangePercent, fee, netInvest, netProfit, netProfitInPercent, } = await (0, utils_1.calculateProfit)(exchange, lastTrade, close);
            const holdDuration = lastTrade
                ? (0, date_fns_1.differenceInMinutes)(timestamp, lastTrade.timestamp)
                : 0;
            const lastNetInvest = lastTrade?.netInvest || startCapital;
            const canExecuteOrder = volume > lastNetInvest;
            //const conservativeTrigger = indicators_25min.vol / 6 > lastNetInvest;
            const exit = netProfitInPercent > 1 * leverage ||
                netProfitInPercent < -0.5 * leverage;
            const exit2 = netProfitInPercent > 5 * leverage ||
                netProfitInPercent < -2.5 * leverage;
            const exit3 = netProfitInPercent > 3 * leverage ||
                netProfitInPercent < -1.5 * leverage;
            const isLiquidation = netProfit < 0 && Math.abs(netProfit) >= lastNetInvest;
            //currently only support one step strategies
            const strategies = {
                "1": {
                    long_entry: [
                        [close < indicators_25min.bollinger_bands.lower],
                        [
                            !!prev_indicators_25min &&
                                close > indicators_25min.bollinger_bands.lower &&
                                indicators_25min.MACD.histogram >
                                    prev_indicators_25min.MACD.histogram,
                        ],
                    ],
                    long_exit: [[exit]],
                    short_entry: [
                        [exchangeConfig.derivatesEnabled],
                        [close > indicators_25min.bollinger_bands.upper],
                        [
                            !!prev_indicators_25min &&
                                close < indicators_25min.bollinger_bands.upper &&
                                indicators_25min.MACD.histogram <
                                    prev_indicators_25min.MACD.histogram,
                        ],
                    ],
                    short_exit: [[exit]],
                },
                //1 with holdDuration
                "2": {
                    long_entry: [
                        [close < indicators_25min.bollinger_bands.lower],
                        [
                            !!prev_indicators_25min &&
                                close > indicators_25min.bollinger_bands.lower &&
                                indicators_25min.MACD.histogram >
                                    prev_indicators_25min.MACD.histogram,
                        ],
                    ],
                    long_exit: [[exit3 || holdDuration > 60 * 12]],
                    short_entry: [
                        [exchangeConfig.derivatesEnabled],
                        [close > indicators_25min.bollinger_bands.upper],
                        [
                            !!prev_indicators_25min &&
                                close < indicators_25min.bollinger_bands.upper &&
                                indicators_25min.MACD.histogram <
                                    prev_indicators_25min.MACD.histogram,
                        ],
                    ],
                    short_exit: [[exit3 || holdDuration > 60 * 12]],
                },
                "3": {
                    long_entry: [
                        [close < indicators_60min.bollinger_bands.lower],
                        [
                            !!prev_indicators_60min &&
                                !!prev_indicators_2h &&
                                close > indicators_60min.bollinger_bands.lower &&
                                indicators_2h.MACD.histogram >
                                    prev_indicators_2h.MACD.histogram,
                        ],
                    ],
                    long_exit: [[exit2]],
                    short_entry: [
                        [exchangeConfig.derivatesEnabled],
                        [close > indicators_60min.bollinger_bands.upper],
                        [
                            !!prev_indicators_60min &&
                                !!prev_indicators_2h &&
                                close < indicators_60min.bollinger_bands.upper &&
                                indicators_2h.MACD.histogram <
                                    prev_indicators_2h.MACD.histogram,
                        ],
                    ],
                    short_exit: [[exit2]],
                },
                //base is 3, even shorter hold duration than 1
                "4": {
                    long_entry: [
                        [close < indicators_60min.bollinger_bands.lower],
                        [
                            !!prev_indicators_60min &&
                                !!prev_indicators_2h &&
                                close > indicators_60min.bollinger_bands.lower &&
                                indicators_2h.MACD.histogram >
                                    prev_indicators_2h.MACD.histogram,
                        ],
                    ],
                    long_exit: [[exit2 || holdDuration > 60 * 24]],
                    short_entry: [
                        [exchangeConfig.derivatesEnabled],
                        [close > indicators_60min.bollinger_bands.upper],
                        [
                            !!prev_indicators_60min &&
                                !!prev_indicators_2h &&
                                close < indicators_60min.bollinger_bands.upper &&
                                indicators_2h.MACD.histogram <
                                    prev_indicators_2h.MACD.histogram,
                        ],
                    ],
                    short_exit: [[exit2 || holdDuration > 60 * 24]],
                },
                //base is 3, indicators shifted to 60 and 25min && exit instead of exit2, hold duration 12h
                "5": {
                    long_entry: [
                        [close < indicators_25min.bollinger_bands.lower],
                        [
                            !!prev_indicators_25min &&
                                !!prev_indicators_60min &&
                                close > indicators_25min.bollinger_bands.lower &&
                                indicators_60min.MACD.histogram >
                                    prev_indicators_60min.MACD.histogram,
                        ],
                    ],
                    long_exit: [[exit || holdDuration > 60 * 12]],
                    short_entry: [
                        [exchangeConfig.derivatesEnabled],
                        [close > indicators_25min.bollinger_bands.upper],
                        [
                            !!prev_indicators_25min &&
                                !!prev_indicators_60min &&
                                close < indicators_25min.bollinger_bands.upper &&
                                indicators_60min.MACD.histogram <
                                    prev_indicators_60min.MACD.histogram,
                        ],
                    ],
                    short_exit: [[exit || holdDuration > 60 * 12]],
                },
                "6": {
                    long_entry: [
                        [close < indicators_25min.bollinger_bands.lower],
                        [
                            !!prev_indicators_25min &&
                                !!prev_indicators_60min &&
                                close > indicators_25min.bollinger_bands.lower &&
                                indicators_60min.MACD.histogram >
                                    prev_indicators_60min.MACD.histogram &&
                                indicators_60min.ADX.pdi > indicators_60min.ADX.mdi,
                        ],
                    ],
                    long_exit: [[exit || holdDuration > 60 * 12]],
                    short_entry: [
                        [exchangeConfig.derivatesEnabled],
                        [close > indicators_25min.bollinger_bands.upper],
                        [
                            !!prev_indicators_25min &&
                                !!prev_indicators_60min &&
                                close < indicators_25min.bollinger_bands.upper &&
                                indicators_60min.MACD.histogram <
                                    prev_indicators_60min.MACD.histogram &&
                                indicators_60min.ADX.pdi < indicators_60min.ADX.mdi,
                        ],
                    ],
                    short_exit: [[exit || holdDuration > 60 * 12]],
                },
                //5 with close tp and sl
                "7": {
                    long_entry: [
                        [close < indicators_25min.bollinger_bands.lower],
                        [
                            !!prev_indicators_25min &&
                                !!prev_indicators_60min &&
                                close > indicators_25min.bollinger_bands.lower &&
                                indicators_60min.MACD.histogram >
                                    prev_indicators_60min.MACD.histogram,
                        ],
                    ],
                    long_exit: [[exit3 || holdDuration > 60 * 12]],
                    short_entry: [
                        [exchangeConfig.derivatesEnabled],
                        [close > indicators_25min.bollinger_bands.upper],
                        [
                            !!prev_indicators_25min &&
                                !!prev_indicators_60min &&
                                close < indicators_25min.bollinger_bands.upper &&
                                indicators_60min.MACD.histogram <
                                    prev_indicators_60min.MACD.histogram,
                        ],
                    ],
                    short_exit: [[exit3 || holdDuration > 60 * 12]],
                },
                //base 5, with RSI
                "8": {
                    long_entry: [
                        [close < indicators_25min.bollinger_bands.lower],
                        [
                            !!prev_indicators_25min &&
                                !!prev_indicators_60min &&
                                close > indicators_25min.bollinger_bands.lower &&
                                indicators_60min.MACD.histogram >
                                    prev_indicators_60min.MACD.histogram &&
                                indicators_25min.RSI < 65,
                        ],
                    ],
                    long_exit: [[exit3 || holdDuration > 60 * 12]],
                    short_entry: [
                        [exchangeConfig.derivatesEnabled],
                        [close > indicators_25min.bollinger_bands.upper],
                        [
                            !!prev_indicators_25min &&
                                !!prev_indicators_60min &&
                                close < indicators_25min.bollinger_bands.upper &&
                                indicators_60min.MACD.histogram <
                                    prev_indicators_60min.MACD.histogram &&
                                indicators_25min.RSI > 35,
                        ],
                    ],
                    short_exit: [[exit3 || holdDuration > 60 * 12]],
                },
            };
            const strategy = strategies[strategyName];
            //check all conditions
            const longEntryChecks = strategy.long_entry[storage[strategyName].indexes.long_entry];
            const longExitChecks = strategy.long_exit[storage[strategyName].indexes.long_exit];
            const shortEntryChecks = strategy.short_entry[storage[strategyName].indexes.short_entry];
            const shortExitChecks = strategy.short_exit[storage[strategyName].indexes.short_exit];
            if (longEntryChecks && longEntryChecks.every((condition) => condition))
                storage[strategyName].indexes.long_entry++;
            if (longExitChecks && longExitChecks.every((condition) => condition))
                storage[strategyName].indexes.long_exit++;
            if (shortEntryChecks && shortEntryChecks.every((condition) => condition))
                storage[strategyName].indexes.short_entry++;
            if (shortExitChecks && shortExitChecks.every((condition) => condition))
                storage[strategyName].indexes.short_exit++;
            const object = {
                timestamp,
                price: close,
                platform: exchange,
                invest: (lastTrade?.netInvest || startCapital) * leverage,
                netInvest: lastTrade ? netInvest : startCapital,
                fee,
                holdDuration,
                details: {
                    indicators_25min,
                    indicators_60min,
                    indicators_2h,
                    candle,
                },
                canExecuteOrder,
            };
            //debug
            //if (trades.length && trades.length % 2 == 0) debugger;
            if (hasOpenPosition) {
                //may happen with canExeq enabled for pushing trades
                //if (holdDuration > 60 * 12 + 1)
                const isLong = lastTrade?.type.includes("Long");
                const longExit = storage[strategyName].indexes.long_exit >=
                    strategy.long_exit.length || isLiquidation;
                const shortExit = storage[strategyName].indexes.short_exit >=
                    strategy.short_exit.length || isLiquidation;
                //logger.debug(`Profit: ${profit}`);
                //logger.debug(`Price change: ${priceChangePercent}`);
                if (longExit || shortExit) {
                    const pricesSinceEntry = history
                        .filter(({ start }) => start > lastTrade.timestamp && start < timestamp)
                        .map((candle) => candle.close);
                    //logger.debug(`Prices since entry: ${pricesSinceEntry.length}`);
                    const highestPrice = Math.max(...pricesSinceEntry);
                    const lowestPrice = Math.min(...pricesSinceEntry);
                    const exitObject = {
                        ...object,
                        type: isLong ? "Long Exit" : "Short Exit",
                        highestPrice,
                        lowestPrice,
                        profit,
                        priceChangePercent,
                        netProfit,
                        netProfitInPercent,
                        isLiquidated: isLiquidation,
                    };
                    storage[strategyName].trades.push(exitObject);
                    storage[strategyName].indexes = {
                        long_entry: 0,
                        long_exit: 0,
                        short_entry: 0,
                        short_exit: 0,
                    };
                }
            }
            if (!hasOpenPosition) {
                if (netInvest < 0)
                    continue;
                const longEntry = storage[strategyName].indexes.long_entry >=
                    strategy.long_entry.length;
                const shortEntry = storage[strategyName].indexes.short_entry >=
                    strategy.short_entry.length;
                if (longEntry || shortEntry) {
                    storage[strategyName].trades.push({
                        ...object,
                        type: longEntry ? "Long Entry" : "Short Entry",
                    });
                    storage[strategyName].indexes = {
                        long_entry: 0,
                        long_exit: 0,
                        short_entry: 0,
                        short_exit: 0,
                    };
                }
            }
        }
    }
    //calculate profit for each strategy
    for (const strategyName of strategyNames) {
        const trades = storage[strategyName]?.trades || [];
        const exits = trades.filter(utils_1.isExitOrder);
        const holdDurations = exits.map((exit) => exit.holdDuration);
        const avgHoldDuration = holdDurations.reduce((a, b) => a + b, 0) / exits.length;
        const netProfits = exits.map((exit) => new bignumber_js_1.default(exit.netProfit));
        const sumProfit = netProfits.reduce((a, b) => a.plus(b), (0, bignumber_js_1.default)(0));
        const netProfitInPercent = sumProfit
            .dividedBy(startCapital)
            .multipliedBy(100)
            .toNumber();
        const hodlProfitInPercent = (history[history.length - 1].close / history[0].close - 1) * 100;
        utils_1.logger.info(`Profit for ${strategyName} on ${symbol}: ${sumProfit} (${netProfitInPercent})`);
        const gotLiquidated = exits.some((trade) => trade.isLiquidated);
        const executedOrders = trades.filter((trade) => trade.canExecuteOrder).length / trades.length;
        const shorts = exits.filter((exit) => exit.type === "Short Exit");
        const longs = exits.filter((exit) => exit.type === "Long Exit");
        const shortLongRatio = `${(shorts.length / exits.length).toFixed(0)}/${(longs.length / exits.length).toFixed(0)}`;
        //calculate profit in timeframes
        //per month
        const months = [
            ...new Set(exits.map(({ timestamp }) => timestamp.toLocaleString("default", { month: "long" }))),
        ];
        const profitInMonth = months.map((month) => {
            return {
                ...(0, utils_1.calculateProfitForTrades)(exits, ({ timestamp }) => timestamp.toLocaleString("default", { month: "long" }) === month),
                key: month,
            };
        });
        const successRate = exits.filter((exit) => exit.profit > 0).length / exits.length;
        const lineOfBestFit = (0, utils_1.calculateLineOfBestFit)(exits.map((exit) => exit.netInvest));
        const result = {
            successRate,
            timestamp: new Date(),
            strategyName,
            exchange,
            startCapital,
            symbol,
            trades,
            netProfit: sumProfit.toFormat(2),
            netProfitInPercent: netProfitInPercent,
            start,
            end,
            avgHoldDuration,
            leverage,
            hodlProfitInPercent,
            profitInMonth,
            gotLiquidated,
            shortLongRatio,
            executedOrders,
            lineOfBestFit,
        };
        await mongoClient.saveBacktest(result);
    }
}
async function main() {
    const { databases } = await mongoClient.listDatabases();
    const systemDatabases = [
        "admin",
        "config",
        "local",
        "worker",
        "backtests",
        "trader",
        "dydx",
    ];
    const exchanges = databases
        .filter((db) => !systemDatabases.includes(db.name))
        .map((db) => db.name);
    utils_1.logger.info(exchanges);
    const pairs = [];
    //create an array of [exchange]@[symbol] pairs
    for (const exchange of exchanges) {
        const collections = await mongoClient.existingCollections(exchange);
        const formatted = collections.map((collection) => {
            return {
                exchange,
                symbol: collection,
            };
        });
        pairs.push(...formatted);
    }
    //shuffle pairs
    pairs.sort(() => Math.random() - 0.5);
    utils_1.logger.info(`Backtesting ${pairs.length} pairs...`);
    //backtest all pairs
    for (const pair of pairs) {
        const { exchange, symbol } = pair;
        //skip USD pairs
        if (symbol.includes("USD") && !symbol.includes("USDT"))
            continue;
        await backtester(exchange, symbol);
    }
    process.exit(0);
}
main();
//# sourceMappingURL=backtester.js.map