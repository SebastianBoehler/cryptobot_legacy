import { addMinutes } from "date-fns";
import config from "./config/config";
import { generateIndicators } from "./generateIndicators";
import mongo from "./mongodb/index";
import {
  BacktestingResult,
  Exchanges,
  ExitOrderObject,
  Rule,
} from "./types/trading";
import {
  calculateProfit,
  calculateProfitForTrades,
  isExitOrder,
  logger,
} from "./utils";
import { Storage } from "./types/backtester";
import BigNumber from "bignumber.js";
const mongoClient = new mongo("admin");

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
  ]; //as const;
  const exchangeConfig = exchangeConfigs[exchange];
  const leverage = exchangeConfig.derivatesEnabled ? config.LEVERAGE || 5 : 1;

  const history = await mongoClient.getTimeAndClose(exchange, symbol);
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

  let prevCandle;

  const startOffest = 60 * 12;
  outerLoop: for (let i = startOffest; i < Infinity; i++) {
    const timestamp = addMinutes(start, i);
    if (timestamp.getTime() > end.getTime()) break;

    //get candle form history and if not available get time<timestamp candle from db
    let candle = history.find(
      ({ start }) => start?.getTime() === timestamp.getTime()
    );
    if (!candle) candle = prevCandle;
    if (!candle) continue;
    const { close, volume } = candle;

    logger.debug(timestamp, exchange, symbol, exchangeConfig.derivatesEnabled);

    const [indicators_25min, indicators_60min, indicators_2h] =
      await Promise.all([
        indicators["25min"].getIndicators(timestamp.getTime()),
        indicators["60min"].getIndicators(timestamp.getTime()),
        indicators["2h"].getIndicators(timestamp.getTime()),
      ]);
    if (startOffest * 2 > i) continue;

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
      const {
        profit,
        priceChangePercent,
        fee,
        netInvest,
        netProfit,
        netProfitInPercent,
      } = await calculateProfit(exchange, lastTrade, close);

      const holdDuration = lastTrade
        ? (timestamp.getTime() - lastTrade.timestamp.getTime()) / 1000 / 60
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

      const isLiquidation =
        netProfit < 0 && Math.abs(netProfit) >= lastNetInvest;

      //currently only support one step strategies
      const strategies: Record<typeof strategyNames[number], Rule> = {
        //base is 6, hold Duration added
        "1": {
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
          long_exit: [[exit2 || holdDuration > 60 * 24 * 2]],
          short_entry: [
            [exchangeConfig.derivatesEnabled],
            [close > indicators_25min.bollinger_bands.upper],
            [
              !!prev_indicators_60min &&
                !!prev_indicators_2h &&
                close < indicators_60min.bollinger_bands.upper &&
                indicators_2h.MACD.histogram <
                  prev_indicators_2h.MACD.histogram,
            ],
          ],
          short_exit: [[exit2 || holdDuration > 60 * 24 * 2]],
        },
        "2": {
          long_entry: [
            [
              close < indicators_25min.bollinger_bands.lower &&
                !!prev_indicators_25min &&
                indicators_25min.MACD.histogram >
                  prev_indicators_25min.MACD.histogram,
            ],
          ],
          long_exit: [[exit]],
          short_entry: [[false]],
          short_exit: [],
        },
        "3": {
          long_entry: [
            [indicators_25min.MACD.histogram < -0.0025],
            [
              indicators_25min.MACD.histogram > 0,
              indicators_60min.ema_8 > indicators_60min.ema_13,
            ],
          ],
          long_exit: [[exit]],
          short_entry: [
            [exchangeConfig.derivatesEnabled],
            [indicators_25min.MACD.histogram > 0.0025],
            [
              indicators_25min.MACD.histogram < 0,
              indicators_60min.ema_8 < indicators_60min.ema_13,
            ],
          ],
          short_exit: [[exit]],
        },
        "4": {
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
        //4 with holdDuration
        "5": {
          long_entry: [
            [close < indicators_25min.bollinger_bands.lower],
            [
              !!prev_indicators_25min &&
                close > indicators_25min.bollinger_bands.lower &&
                indicators_25min.MACD.histogram >
                  prev_indicators_25min.MACD.histogram,
            ],
          ],
          long_exit: [[exit || holdDuration > 60 * 12]],
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
          short_exit: [[exit || holdDuration > 60 * 12]],
        },
        "6": {
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
            [close > indicators_25min.bollinger_bands.upper],
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
        //base is 6, even shorter hold duration than 1
        "7": {
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
            [close > indicators_25min.bollinger_bands.upper],
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
        //base is 6, indicators shifted to 60 and 25min && exit instead of exit2, hold duration 12h
        "8": {
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
        "9": {
          long_entry: [
            [close < indicators_25min.bollinger_bands.lower],
            [
              !!prev_indicators_25min &&
                !!prev_indicators_60min &&
                close > indicators_25min.bollinger_bands.lower &&
                indicators_60min.MACD.histogram >
                  prev_indicators_60min.MACD.histogram &&
                indicators_60min.ADX.pdi > indicators_60min.ADX.mdi &&
                indicators_60min.ADX.adx > 20,
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
                indicators_60min.ADX.pdi < indicators_60min.ADX.mdi &&
                indicators_60min.ADX.adx > 20,
            ],
          ],
          short_exit: [[exit || holdDuration > 60 * 12]],
        },
        //8 with close tp and sl
        "10": {
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
        //base 8, with RSI
        "11": {
          long_entry: [
            [close < indicators_25min.bollinger_bands.lower],
            [
              !!prev_indicators_25min &&
                !!prev_indicators_60min &&
                close > indicators_25min.bollinger_bands.lower &&
                indicators_60min.MACD.histogram >
                  prev_indicators_60min.MACD.histogram &&
                indicators_25min.RSI < 60,
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
                indicators_25min.RSI > 40,
            ],
          ],
          short_exit: [[exit || holdDuration > 60 * 12]],
        },
      };

      const strategy = strategies[strategyName];

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
      };

      //debug
      //if (trades.length && trades.length % 2 == 0) debugger;

      if (hasOpenPosition) {
        const isLong = lastTrade?.type.includes("Long");
        const longExit =
          storage[strategyName].indexes.long_exit >=
            strategy.long_exit.length || isLiquidation;
        const shortExit =
          storage[strategyName].indexes.short_exit >=
            strategy.short_exit.length || isLiquidation;

        //logger.debug(`Profit: ${profit}`);
        //logger.debug(`Price change: ${priceChangePercent}`);
        if ((longExit || shortExit) && canExecuteOrder) {
          const pricesSinceEntry = history
            .filter(
              ({ start }) => start! > lastTrade.timestamp && start! < timestamp
            )
            .map((candle) => candle.close);

          //logger.debug(`Prices since entry: ${pricesSinceEntry.length}`);
          const highestPrice = Math.max(...pricesSinceEntry);
          const lowestPrice = Math.min(...pricesSinceEntry);

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
        if (netInvest < 0) continue;
        const longEntry =
          storage[strategyName].indexes.long_entry >=
          strategy.long_entry.length;
        const shortEntry =
          storage[strategyName].indexes.short_entry >=
          strategy.short_entry.length;
        if ((longEntry || shortEntry) && canExecuteOrder) {
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
    const exits = trades.filter(isExitOrder);
    const holdDurations = exits.map((exit) => exit.holdDuration);
    const avgHoldDuration =
      holdDurations.reduce((a, b) => a + b, 0) / exits.length;
    const netProfits = exits.map((exit) => new BigNumber(exit.netProfit));
    const sumProfit = netProfits.reduce((a, b) => a.plus(b), BigNumber(0));
    const netProfitInPercent = sumProfit
      .dividedBy(startCapital)
      .multipliedBy(100)
      .toNumber();
    const hodlProfitInPercent =
      (history[history.length - 1].close / history[0].close - 1) * 100;

    logger.info(
      `Profit for ${strategyName} on ${symbol}: ${sumProfit} (${netProfitInPercent})`
    );
    const gotLiquidated = exits.some((trade) => trade.isLiquidated);

    //calculate profit in timeframes
    //per month
    const months = [
      ...new Set(
        exits.map(({ timestamp }) =>
          timestamp.toLocaleString("default", { month: "long" })
        )
      ),
    ];
    const profitInMonth = months.map((month) => {
      return {
        ...calculateProfitForTrades(
          exits,
          ({ timestamp }) =>
            timestamp.toLocaleString("default", { month: "long" }) === month
        ),
        key: month,
      };
    });

    const successRate =
      exits.filter((exit) => exit.profit > 0).length / exits.length;

    const result: BacktestingResult = {
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
    "dydx",
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
    await backtester(exchange as Exchanges, symbol);
  }

  process.exit(0);
}

main();
