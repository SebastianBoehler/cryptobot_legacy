import { differenceInMinutes, subDays } from "date-fns";
import config from "./config/config";
import { GenerateIndicators } from "./generateIndicators";
import mongo from "./mongodb/index";
import {
  BacktestingResult,
  Exchanges,
  ExitOrderObject,
  Indicators,
  Rule,
} from "./types/trading";
import {
  calculateBacktestResult,
  calculateProfit,
  logger,
  trailingStopLoss,
} from "./utils";
import { Storage } from "./types/backtester";
import BigNumber from "bignumber.js";
const mongoClient = new mongo("admin");

const startTime: Date | null = subDays(new Date(), 30 * 4);

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
  let strategyNames: string[] = ["random"]; //as const;
  const exchangeConfig = exchangeConfigs[exchange];
  const leverage = exchangeConfig.derivatesEnabled ? config.LEVERAGE || 5 : 1;

  const history = await mongoClient.getHistory<{
    start: Date;
    close: string;
    volume: string;
  }>(exchange, symbol, {
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
    "5min": new GenerateIndicators(exchange, symbol, 5),
    "15min": new GenerateIndicators(exchange, symbol, 15),
    "30min": new GenerateIndicators(exchange, symbol, 30),
    "1h": new GenerateIndicators(exchange, symbol, 60),
    "90min": new GenerateIndicators(exchange, symbol, 90),
    "4h": new GenerateIndicators(exchange, symbol, 60 * 4),
    "12h": new GenerateIndicators(exchange, symbol, 60 * 12),
    "1d": new GenerateIndicators(exchange, symbol, 60 * 24),
  };

  const promises = Object.keys(indicators).map(async (key) => {
    await indicators[key as keyof typeof indicators].loadHistoricCandles();
  });
  await Promise.all(promises);

  outerLoop: for (const [i, candle] of history.entries()) {
    const timestamp = candle.start;
    if (i > 1 && differenceInMinutes(timestamp, history[i - 1].start) > 1) {
      debugger;
      throw new Error(
        `Missing candle for ${timestamp} on ${exchange} ${symbol}`
      );
    }
    if (timestamp.getTime() >= end.getTime()) break;
    if (startTime && timestamp < startTime) continue;
    //get candle form history and if not available get time<timestamp candle from db do not use . find since it is slow

    if (!candle)
      throw new Error(
        `Candle not found for ${i} ${timestamp}, ${symbol}, ${start}`
      );
    const volume = +candle.volume;
    const close = +candle.close;

    if (i % 500 == 0) logger.debug(timestamp, exchange, symbol);

    const [
      indicators_5min,
      indicators_15min,
      indicators_30min,
      indicators_1h,
      indicators_4h,
      indicators_12h,
      indicators_1d,
    ] = await Promise.all([
      indicators["5min"].getIndicators(timestamp.getTime()),
      indicators["15min"].getIndicators(timestamp.getTime()),
      indicators["30min"].getIndicators(timestamp.getTime()),
      indicators["1h"].getIndicators(timestamp.getTime()),
      indicators["4h"].getIndicators(timestamp.getTime()),
      indicators["12h"].getIndicators(timestamp.getTime()),
      indicators["1d"].getIndicators(timestamp.getTime()),
    ]);
    if (!indicators_12h.ema_55) continue;
    if (startTime && startTime > timestamp) continue;

    const prev_indicators_5min = indicators["5min"].prevValues;
    const prev_indicators_15min = indicators["15min"].prevValues;
    const prev_indicators_30min = indicators["30min"].prevValues;
    const prev_indicators_1h = indicators["1h"].prevValues;
    const prev_indicators_4h = indicators["4h"].prevValues;
    const prev_indicators_12h = indicators["12h"].prevValues;
    const prev_indicators_1d = indicators["1d"].prevValues;

    if (
      !prev_indicators_5min ||
      !prev_indicators_15min ||
      !prev_indicators_30min ||
      !prev_indicators_1h ||
      !prev_indicators_4h ||
      !prev_indicators_12h ||
      !prev_indicators_1d
    )
      continue;

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

      const isLiquidation =
        netProfit < 0 && Math.abs(netProfit) >= lastNetInvest;

      const trailingStopLossParams = {
        lastTrade,
        price: close,
        trailingStopLossPercent: 0.5,
        high: highestPrice,
        low: lowestPrice,
      };

      const futurePrice30min = +history[i + 30]?.close || null;
      const timeSpan = history.slice(i, i + 30);
      const lowInFuturesSpan = Math.min(...timeSpan.map((c) => +c.close));
      const highInFuturesSpan = Math.max(...timeSpan.map((c) => +c.close));

      //currently only support one step strategies
      const strategies: Record<(typeof strategyNames)[number], Rule> = {
        "0_long": {
          isCorrelationTest: true,
          long_entry: [[!!futurePrice30min && futurePrice30min / close > 1.01]],
          long_exit: [[holdDuration > 29 || netProfitInPercent > 1 * leverage]],
          short_entry: [[false]],
          short_exit: [[false]],
        },
        papa: {
          long_entry: [[!lastTrade || holdDuration > 60 * 2]],
          long_exit: [
            [
              netProfitInPercent > 1 * leverage ||
                netProfitInPercent < -0.5 * leverage,
            ],
          ],
          short_entry: [[false]],
          short_exit: [[false]],
        },
        "0_short": {
          isCorrelationTest: true,
          long_entry: [[false]],
          long_exit: [[false]],
          short_entry: [
            [!!futurePrice30min && futurePrice30min / close < 0.99],
          ],
          short_exit: [
            [holdDuration > 29 || netProfitInPercent > 1 * leverage],
          ],
        },
        "1_long": {
          isCorrelationTest: true,
          long_entry: [
            [
              !!futurePrice30min &&
                futurePrice30min / close > 1.01 &&
                lowInFuturesSpan / close > 0.995,
            ],
          ],
          long_exit: [[holdDuration > 29 || netProfitInPercent > 1 * leverage]],
          short_entry: [[false]],
          short_exit: [[false]],
        },
        "1_short": {
          isCorrelationTest: true,
          long_entry: [[false]],
          long_exit: [[false]],
          short_entry: [
            [
              !!futurePrice30min &&
                futurePrice30min / close < 0.99 &&
                highInFuturesSpan / close < 1.005,
            ],
          ],
          short_exit: [
            [holdDuration > 29 || netProfitInPercent > 1 * leverage],
          ],
        },
        "2_long": {
          isCorrelationTest: true,
          long_entry: [
            [
              !!futurePrice30min &&
                futurePrice30min / close > 1.01 &&
                lowInFuturesSpan / close > 0.995,
            ],
          ],
          long_exit: [
            [
              holdDuration > 29 ||
                netProfitInPercent > 1 * leverage ||
                trailingStopLoss(trailingStopLossParams),
            ],
          ],
          short_entry: [[false]],
          short_exit: [[false]],
        },
        //work only on 2 strategies
        "15min-strat-long": {
          long_entry: [
            [indicators_15min.RSI > 30],
            [
              indicators_15min.RSI < 30 &&
                indicators_15min.RSI > prev_indicators_15min.RSI,
            ],
          ],
          long_exit: [
            [
              netProfitInPercent > 1 * leverage ||
                netProfitInPercent < -0.5 * leverage ||
                (holdDuration > 30 && netProfitInPercent < 0) ||
                holdDuration > 60,
            ],
          ],
          short_entry: [[false]],
          short_exit: [[false]],
        },
        "1d-strat-long": {
          long_entry: [
            [
              !!indicators_1d.OBV &&
                indicators_1d.OBV > indicators_1d.OBV_SMA &&
                indicators_1d.RSI < 50,
            ],
          ],
          long_exit: [
            [
              indicators_1d.RSI > 70 ||
                (!!indicators_1d.OBV &&
                  indicators_1d.OBV < indicators_1d.OBV_SMA) ||
                trailingStopLoss({
                  ...trailingStopLossParams,
                  trailingStopLossPercent: 3,
                }) ||
                netProfitInPercent > 6,
            ],
          ],
          short_entry: [[false]],
          short_exit: [[false]],
        },
        "1d-strat-short": {
          long_entry: [[false]],
          long_exit: [[false]],
          short_entry: [
            [
              !!indicators_1d.OBV &&
                indicators_1d.OBV < indicators_1d.OBV_SMA &&
                indicators_1d.RSI > 50,
            ],
          ],
          short_exit: [
            [
              indicators_1d.RSI < 30 ||
                (!!indicators_1d.OBV &&
                  indicators_1d.OBV > indicators_1d.OBV_SMA) ||
                trailingStopLoss({
                  ...trailingStopLossParams,
                  trailingStopLossPercent: 3,
                }) ||
                netProfitInPercent > 6,
            ],
          ],
        },
      };

      const strategyNamesParsed = Object.keys(strategies);
      if (strategyNamesParsed.length > strategyNames.length)
        strategyNames = strategyNamesParsed;

      const strategy = strategies[strategyName];
      if (!strategy) {
        logger.error(`Strategy ${strategyName} not found`);
        continue outerLoop;
      }
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

      const extendIndicators = (item: Indicators, prev: Indicators) => {
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
            increase:
              prev.bollinger_bands.upper /
              prev.bollinger_bands.lower /
              (item.bollinger_bands.upper / item.bollinger_bands.lower),
          },
          stochRSI: {
            ...item.stochRSI,
            diff: item.stochRSI.k / item.stochRSI.d,
          },
          holdDuration,
          ema_diff: item.ema_8 / item.ema_55,
          ema8_increasing: prev.ema_8 / item.ema_8,
          ema55_increasing: prev.ema_55 / item.ema_55,
          HA: {
            ...item.HA,
            diff_oc: item.HA.o / item.HA.c,
            diff_hl: item.HA.h / item.HA.l,
          },
          candle: {
            ...item.candle,
            diff_oc: item.candle
              ? +item.candle.open / +item.candle.close
              : undefined,
            diff_hl: item.candle
              ? +item.candle.high / +item.candle.low
              : undefined,
          },
          RSI_and_EMA: {
            variant1: +(item.RSI < 35 && item.ema_8 > item.ema_55),
            variant2: +(item.RSI > 65 && item.ema_8 < item.ema_55),
            variant3: +(
              item.RSI < 35 &&
              item.ema_8 / item.ema_55 > prev.ema_8 / prev.ema_55
            ),
          },
          RSI_threshold: {
            variant1: +(item.RSI < 35),
            variant2: +(item.RSI > 65),
            variant3: +(item.RSI < 50),
            variant4: +(item.RSI > 50),
          },
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
          indicators_5min: extendIndicators(
            indicators_5min,
            prev_indicators_5min
          ),
          indicators_15min: extendIndicators(
            indicators_15min,
            prev_indicators_15min
          ),
          indicators_30min: extendIndicators(
            indicators_30min,
            prev_indicators_30min
          ),
          indicators_1h: extendIndicators(indicators_1h, prev_indicators_1h),
          indicators_4h: extendIndicators(indicators_4h, prev_indicators_4h),
          indicators_12h: extendIndicators(indicators_12h, prev_indicators_12h),
          indicators_1d: extendIndicators(indicators_1d, prev_indicators_1d),
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
          if (netProfit > 10 && strategy.saveProfits) {
            object.netInvest =
              (lastTrade.netInvest ?? startCapital) + netProfit * 0.9; //10% saved
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
            //timeInLoss,
            //timeInLossInPercent: (timeInLoss / holdDuration) * 100,
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
        if (netInvest < 0 && !strategy.isCorrelationTest) continue;
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

  const hodlProfitInPercent =
    (+history[history.length - 1].close / +history[0].close - 1) * 100;

  //calculate profit for each strategy
  for (const strategyName of strategyNames) {
    const trades = storage[strategyName]?.trades || [];

    const calculatedResult = calculateBacktestResult(trades, startCapital);

    logger.info(
      `Profit for ${strategyName} on ${symbol}: ${calculatedResult.netProfit} (${calculatedResult.netProfitInPercent})`
    );

    const result: BacktestingResult = {
      ...calculatedResult,
      symbol,
      strategyName,
      exchange,
      start: startTime || start,
      end,
      leverage,
      hodlProfitInPercent,
      tradesCount: trades.length,
    };

    try {
      await mongoClient.saveBacktest(result);
    } catch (error: unknown) {
      await mongoClient.saveBacktest({
        ...result,
        trades: trades.slice(0, 2_000),
      });
      logger.error(error);
      logger.error(
        `Failed to save backtest for ${symbol} ${strategyName} trades: ${trades.length}`
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

  let pairs: { exchange: string; symbol: string }[] = [];

  //create an array of [exchange]@[symbol] pairs
  for (const exchange of exchanges) {
    const symbolsAndVol = await mongoClient.symbolsSortedByVolume(
      exchange,
      true
    );
    const formatted = symbolsAndVol.slice(0, 25).map(({ symbol }) => ({
      exchange,
      symbol,
    }));

    pairs.push(...formatted);
  }

  const start = +process.argv[2];
  const size = +process.argv[3];
  if (start !== undefined && size) {
    pairs = pairs.slice(start, start + size);
  }

  //shuffle pairs
  //pairs.sort(() => Math.random() - 0.5);
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
