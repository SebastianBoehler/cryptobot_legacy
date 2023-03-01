import { addMinutes } from "date-fns";
import config from "./config/config";
import { generateIndicators } from "./generateIndicators";
import mongo from "./mongodb/index";
import { getTimeKey } from "./mongodb/utils";
import { BacktestingResult, Exchanges, Rule } from "./types/trading";
import { calculateProfit, logger } from "./utils";
import { Storage } from "./types/backtester";
const mongoClient = new mongo("admin");

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
};

async function backtester(exchange: Exchanges, symbol: string) {
  const strategyNames = ["1", "2", "3", "4"] as const;
  const timeKey = getTimeKey(exchange);
  const exchangeConfig = exchangeConfigs[exchange];
  const leverage = exchangeConfig.derivatesEnabled ? config.LEVERAGE || 5 : 1;

  const history = await mongoClient.getTimeAndClose(exchange, symbol, timeKey);
  const { start, end } = await mongoClient.getStartAndEndDates(
    exchange,
    symbol,
    timeKey
  );

  const storage: Storage = {};
  const startCapital = 1_500;

  const indicators = {
    "25min": new generateIndicators(exchange, symbol, 25),
    "60min": new generateIndicators(exchange, symbol, 60),
  };

  let prevCandle;

  outerLoop: for (let i = 60 * 12; i < Infinity; i++) {
    const timestamp = addMinutes(start, i);
    if (timestamp.getTime() > end.getTime()) break;

    //get candle form history and if not available get time<timestamp candle from db
    let candle = history.find(
      (candle) => candle[timeKey]?.getTime() === timestamp.getTime()
    );
    if (!candle) candle = prevCandle;
    if (!candle) continue;
    const { close } = candle;

    logger.debug(timestamp, exchange, symbol, exchangeConfig.derivatesEnabled);

    const [indicators_25min, indicators_60min] = await Promise.all([
      indicators["25min"].getIndicators(timestamp.getTime()),
      indicators["60min"].getIndicators(timestamp.getTime()),
    ]);

    const prev_indicators_25min = await indicators["25min"].prevValues;

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
      } = await calculateProfit(exchange, lastTrade, close, leverage);

      if (lastTrade && lastTrade.invest <= 0) continue;

      const holdDuration = lastTrade
        ? (timestamp.getTime() - lastTrade.timestamp.getTime()) / 1000 / 60
        : 0;

      const lastNetInvest = lastTrade?.netInvest || 0;
      const entry = indicators_25min.vol / 3 > lastNetInvest;
      const exit = profit > 0.05 || profit < -0.025 || holdDuration > 60 * 3;

      if (!entry && holdDuration > 60 * 48) {
        lastTrade.netInvest = startCapital;
      }

      //currently only support one step strategies
      const strategies: Record<typeof strategyNames[number], Rule> = {
        "1": {
          long_entry: [
            [
              indicators_25min.ema_8 > indicators_25min.ema_13,
              indicators_60min.ema_8 > indicators_60min.ema_13,
            ],
          ],
          long_exit: [[exit]],
          short_entry: [[exchangeConfig.derivatesEnabled]],
          short_exit: [],
        },
        "2": {
          long_entry: [[close < indicators_25min.bollinger_bands.lower]],
          long_exit: [[exit]],
          short_entry: [[exchangeConfig.derivatesEnabled]],
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
        netInvest,
        priceChangePercent,
        profit,
        netProfit,
        netProfitInPercent,
        fee,
        holdDuration,
      };

      if (hasOpenPosition) {
        const isLong = lastTrade?.type.includes("Long");
        const longExit =
          storage[strategyName].indexes.long_exit >= strategy.long_exit.length;
        const shortExit =
          storage[strategyName].indexes.short_exit >=
          strategy.short_exit.length;

        logger.debug(`Profit: ${profit}`);
        logger.debug(`Price change: ${priceChangePercent}`);
        if (isLong && longExit) {
          //logger.info(`Long exit [${strategyName}]: ${profit}`);
          storage[strategyName].trades.push({
            ...object,
            type: "Long Exit",
          });
          storage[strategyName].indexes = {
            long_entry: 0,
            long_exit: 0,
            short_entry: 0,
            short_exit: 0,
          };
        }
        if (!isLong && shortExit) {
          //logger.info(`Short exit [${strategyName}]: ${profit}`);
          storage[strategyName].trades.push({
            ...object,
            type: "Short Exit",
          });
          storage[strategyName].indexes = {
            long_entry: 0,
            long_exit: 0,
            short_entry: 0,
            short_exit: 0,
          };
        }
      }

      if (!hasOpenPosition && entry) {
        const longEntry =
          storage[strategyName].indexes.long_entry >=
          strategy.long_entry.length;
        const shortEntry =
          storage[strategyName].indexes.short_entry >=
          strategy.short_entry.length;
        if (longEntry || shortEntry) {
          //logger.info(`Long entry [${strategyName}]`);
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
    const trades = storage[strategyName].trades || [];
    const exits = trades.filter((trade) => trade.type.includes("Exit"));
    const holdDurations = exits.map((exit) => exit.holdDuration);
    const avgHoldDuration =
      holdDurations.reduce((a, b) => a + b, 0) / exits.length;
    const netProfits = exits.map((exit) => exit.netProfit);
    const sumProfit = netProfits.reduce((a, b) => a + b, 0);
    const netProfitInPercent = (+sumProfit / startCapital).toLocaleString(
      "en-US",
      { style: "percent", minimumFractionDigits: 2 }
    );
    logger.info(
      `Profit for ${strategyName}: ${sumProfit} (${netProfitInPercent})`
    );

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
      netProfit: sumProfit.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      }),
      netProfitInPercent: netProfitInPercent,
      start,
      end,
      avgHoldDuration,
      leverage,
    };

    await mongoClient.saveBacktest(result);
  }
}

async function main() {
  const { databases } = await mongoClient.listDatabases();
  const systemDatabases = ["admin", "config", "local", "backtests"];
  const exchanges = databases
    .filter((db) => !systemDatabases.includes(db.name))
    .map((db) => db.name) as Exchanges[];
  logger.info(exchanges);

  const pairs: string[] = [];

  //create an array of [exchange]@[symbol] pairs
  for (const exchange of exchanges) {
    const collections = await mongoClient.existingCollections(exchange);
    const formatted = collections.map((collection) => {
      return `${exchange}@${collection}`;
    });
    pairs.push(...formatted);
  }

  //shuffle pairs
  pairs.sort(() => Math.random() - 0.5);

  //backtest all pairs
  for (const pair of pairs) {
    const [exchange, symbol] = pair.split("@");
    await backtester(exchange as Exchanges, symbol);
  }
}

main();
