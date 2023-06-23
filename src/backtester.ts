import { addMinutes, differenceInMinutes, subDays } from "date-fns";
import config from "./config/config";
import { generateIndicators } from "./generateIndicators";
import mongo from "./mongodb/index";
import {
  BacktestingResult,
  Exchanges,
  ExitOrderObject,
  Indicators,
  Rule,
} from "./types/trading";
import { calculateBacktestResult, calculateProfit, logger } from "./utils";
import { Storage } from "./types/backtester";
import BigNumber from "bignumber.js";
import { subMinutes } from "date-fns";
const mongoClient = new mongo("admin");

const startTime: Date | null = subDays(new Date(), 30 * 6);

BigNumber.config({
  FORMAT: {
    groupSeparator: ",",
    decimalSeparator: ".",
    groupSize: 3,
  },
});

const exchangeConfigs: Record<
  Exchanges,
  {
    derivatesEnabled: boolean;
  }
> = {
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

async function backtester(exchange: Exchanges, symbol: string) {
  const strategyNames = [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
  ]; //as const;
  const exchangeConfig = exchangeConfigs[exchange];
  const leverage = exchangeConfig.derivatesEnabled ? config.LEVERAGE || 5 : 1;

  const history = await mongoClient.getHistory(exchange, symbol, {
    start: 1,
    close: 1,
    volume: 1,
  });
  const startAndEndDates = await mongoClient.getStartAndEndDates(
    exchange,
    symbol
  );

  if (!startAndEndDates) return;
  const { start, end } = startAndEndDates;

  const storage: Storage = {};
  const startCapital = 1_500;

  const indicators = {
    "25min": new generateIndicators(exchange, symbol, 25),
    "60min": new generateIndicators(exchange, symbol, 60),
    "2h": new generateIndicators(exchange, symbol, 60 * 2),
  };

  const startOffest = 60 * 12;
  outerLoop: for (let i = startOffest; i < Infinity; i++) {
    const timestamp = addMinutes(start, i);
    if (timestamp.getTime() >= end.getTime()) break;
    if (startTime && timestamp < subMinutes(startTime, startOffest * 2))
      continue;

    //get candle form history and if not available get time<timestamp candle from db
    let candle = history.find(
      ({ start }) => start.getTime() === subMinutes(timestamp, 1).getTime()
    );

    if (!candle)
      throw new Error(`Candle not found for ${timestamp}, ${symbol}, ${start}`);
    const { volume } = candle;
    const close = +candle.close;

    logger.debug(timestamp, exchange, symbol, exchangeConfig.derivatesEnabled);

    const [indicators_25min, indicators_60min, indicators_2h] =
      await Promise.all([
        indicators["25min"].getIndicators(timestamp.getTime()),
        indicators["60min"].getIndicators(timestamp.getTime()),
        indicators["2h"].getIndicators(timestamp.getTime()),
      ]);
    if (startOffest * 4 > i || indicators_2h.ema_55 === 0) continue;
    if (startTime && startTime > timestamp) continue;

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

      let highestPrice = storage[strategyName].highestPrice;
      let lowestPrice = storage[strategyName].lowestPrice;
      if (!highestPrice || close > highestPrice) {
        storage[strategyName].highestPrice = close;
        highestPrice = close;
      }
      if (!lowestPrice || close < lowestPrice) {
        storage[strategyName].lowestPrice = close;
        lowestPrice = close;
      }
      const trades = storage[strategyName].trades;
      const lastTrade = trades[trades.length - 1];
      const hasOpenPosition = lastTrade?.type.includes("Entry");
      const isLong = lastTrade?.type.includes("Long");
      const {
        profit,
        priceChangePercent,
        fee,
        netInvest,
        netProfit,
        netProfitInPercent,
      } = await calculateProfit(exchange, lastTrade, close);

      const holdDuration = lastTrade
        ? differenceInMinutes(timestamp, lastTrade.timestamp)
        : 0;

      const lastNetInvest = lastTrade?.netInvest || startCapital;
      const canExecuteOrder = volume > lastNetInvest;
      //const conservativeTrigger = indicators_25min.vol / 6 > lastNetInvest;
      const exit =
        netProfitInPercent > 1 * leverage ||
        netProfitInPercent < -0.5 * leverage;
      const exit2 =
        netProfitInPercent > 5 * leverage ||
        netProfitInPercent < -2.5 * leverage;
      const exit3 =
        netProfitInPercent > 3 * leverage ||
        netProfitInPercent < -1.5 * leverage;
      const trailingExit =
        (close < highestPrice * 0.985 && isLong) ||
        (close > lowestPrice * 1.015 && !isLong);

      const isLiquidation =
        netProfit < 0 && Math.abs(netProfit) >= lastNetInvest;

      //currently only support one step strategies
      const strategies: Record<(typeof strategyNames)[number], Rule> = {
        //really basic for indicator analysis
        "0": {
          long_entry: [[holdDuration > 60 * 6 || !lastTrade]],
          long_exit: [[exit3]],
          short_entry: [[holdDuration > 60 * 6 || !lastTrade]],
          short_exit: [[exit3]],
        },
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
        //base 7, with BB middle line
        "9": {
          long_entry: [
            [close < indicators_25min.bollinger_bands.lower],
            [
              !!prev_indicators_25min &&
                !!prev_indicators_60min &&
                close > indicators_25min.bollinger_bands.lower &&
                close < indicators_25min.bollinger_bands.middle &&
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
                close > indicators_25min.bollinger_bands.middle &&
                indicators_60min.MACD.histogram <
                  prev_indicators_60min.MACD.histogram,
            ],
          ],
          short_exit: [[exit3 || holdDuration > 60 * 12]],
        },
        //3 with trailing stop
        "10": {
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
          long_exit: [[exit2 || trailingExit]],
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
          short_exit: [[exit2 || trailingExit]],
        },
        //8 with trailing stop
        "11": {
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
          long_exit: [[exit3 || holdDuration > 60 * 12 || trailingExit]],
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
          short_exit: [[exit3 || holdDuration > 60 * 12 || trailingExit]],
        },
        //copy of 4 with saveProfits
        "12": {
          saveProfits: true,
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
        //3 with trailing stop, saveProfits and holdDuration 24h
        "13": {
          saveProfits: true,
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
          long_exit: [[exit2 || trailingExit || holdDuration > 60 * 24]],
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
          short_exit: [[exit2 || trailingExit || holdDuration > 60 * 24]],
        },
      };

      const strategy = strategies[strategyName];
      //strategy.saveProfits = true;

      //check all conditions
      const longEntryChecks =
        strategy.long_entry[storage[strategyName].indexes.long_entry];
      const longExitChecks =
        strategy.long_exit[storage[strategyName].indexes.long_exit];
      const shortEntryChecks =
        strategy.short_entry[storage[strategyName].indexes.short_entry];
      const shortExitChecks =
        strategy.short_exit[storage[strategyName].indexes.short_exit];

      if (longEntryChecks && longEntryChecks.every((condition) => condition))
        storage[strategyName].indexes.long_entry++;
      if (longExitChecks && longExitChecks.every((condition) => condition))
        storage[strategyName].indexes.long_exit++;
      if (shortEntryChecks && shortEntryChecks.every((condition) => condition))
        storage[strategyName].indexes.short_entry++;
      if (shortExitChecks && shortExitChecks.every((condition) => condition))
        storage[strategyName].indexes.short_exit++;

      const extendIndicators = (item: Indicators) => {
        return {
          ...item,
          ADX: {
            ...item.ADX,
            diff: item.ADX.pdi / item.ADX.mdi,
            strong: +(item.ADX.adx > 25 && item.ADX.adx < 50),
            veryStrong: +(item.ADX.adx > 50 && item.ADX.adx < 75),
            extremelyStrong: +(item.ADX.adx > 75),
          },
          bollinger_bands: {
            ...item.bollinger_bands,
            diff: item.bollinger_bands.upper / item.bollinger_bands.lower,
          },
          stochRSI: {
            ...item.stochRSI,
            diff: item.stochRSI.k / item.stochRSI.d,
          },
          holdDuration,
          ema_diff: item.ema_8 / item.ema_55,
        };
      };

      const object = {
        timestamp,
        price: close,
        platform: exchange,
        invest: (lastTrade?.netInvest || startCapital) * leverage,
        netInvest: lastTrade ? netInvest : startCapital,
        portfolio: lastTrade ? lastTrade.portfolio + netProfit : startCapital,
        fee,
        holdDuration,
        details: {
          indicators_25min: extendIndicators(indicators_25min),
          indicators_60min: extendIndicators(indicators_60min),
          indicators_2h: extendIndicators(indicators_2h),
          candle,
          highestPrice,
          lowestPrice,
        },
        canExecuteOrder,
      };

      //debug
      //if (trades.length && trades.length % 2 == 0) debugger;

      if (hasOpenPosition) {
        //may happen with canExeq enabled for pushing trades
        //if (holdDuration > 60 * 12 + 1)
        const longExit =
          storage[strategyName].indexes.long_exit >=
            strategy.long_exit.length || isLiquidation;
        const shortExit =
          storage[strategyName].indexes.short_exit >=
            strategy.short_exit.length || isLiquidation;

        //logger.debug(`Profit: ${profit}`);
        //logger.debug(`Price change: ${priceChangePercent}`);
        if (longExit || shortExit) {
          const pricesSinceEntry = history
            .filter(
              ({ start }) => start! > lastTrade.timestamp && start! < timestamp
            )
            .map((candle) => candle.close);

          //logger.debug(`Prices since entry: ${pricesSinceEntry.length}`);
          const highestPrice = Math.max(...pricesSinceEntry);
          const lowestPrice = Math.min(...pricesSinceEntry);

          //time in loss
          const timeInLoss = pricesSinceEntry.filter((price) =>
            isLong ? price < lastTrade.price : price > lastTrade.price
          ).length;

          if (netProfit > 10 && strategy.saveProfits) {
            object.netInvest =
              (lastTrade.netInvest ?? startCapital) + netProfit * 0.25;
          }

          const exitObject: ExitOrderObject = {
            ...object,
            type: isLong ? "Long Exit" : "Short Exit",
            highestPrice,
            lowestPrice,
            profit,
            priceChangePercent,
            netProfit,
            netProfitInPercent,
            isLiquidated: isLiquidation,
            timeInLoss,
            timeInLossInPercent:
              (timeInLoss / (pricesSinceEntry.length || timeInLoss)) * 100,
          };

          storage[strategyName].trades.push(exitObject);
          storage[strategyName].highestPrice = undefined;
          storage[strategyName].lowestPrice = undefined;
          storage[strategyName].indexes = {
            long_entry: 0,
            long_exit: 0,
            short_entry: 0,
            short_exit: 0,
          };
        }
      }

      if (!hasOpenPosition) {
        if (netInvest < 0) continue;
        const longEntry =
          storage[strategyName].indexes.long_entry >=
          strategy.long_entry.length;
        const shortEntry =
          storage[strategyName].indexes.short_entry >=
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
          storage[strategyName].highestPrice = undefined;
          storage[strategyName].lowestPrice = undefined;
        }
      }
    }
  }

  //calculate profit for each strategy
  for (const strategyName of strategyNames) {
    const trades = storage[strategyName]?.trades || [];
    const hodlProfitInPercent =
      (history[history.length - 1].close / history[0].close - 1) * 100;

    const calculatedResult = calculateBacktestResult(trades, startCapital);

    logger.info(
      `Profit for ${strategyName} on ${symbol}: ${calculatedResult.netProfit} (${calculatedResult.netProfitInPercent})`
    );

    const result: BacktestingResult = {
      ...calculatedResult,
      symbol,
      strategyName,
      exchange,
      start,
      end,
      leverage,
      hodlProfitInPercent,
    };

    try {
      await mongoClient.saveBacktest(result);
    } catch (error) {
      logger.error(error);
      logger.error(
        `Failed to save backtest for ${symbol} trades: ${trades.length}`
      );
    }
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
    "lifi",
  ];
  const exchanges = databases
    .filter((db) => !systemDatabases.includes(db.name))
    .map((db) => db.name) as Exchanges[];
  logger.info(exchanges);

  const pairs: { exchange: string; symbol: string }[] = [];

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
  logger.info(`Backtesting ${pairs.length} pairs...`);

  //backtest all pairs
  for (const pair of pairs) {
    const { exchange, symbol } = pair;
    //skip USD pairs
    if (symbol.includes("USD") && !symbol.includes("USDT")) continue;
    await backtester(exchange as Exchanges, symbol);
  }

  process.exit(0);
}

main();
