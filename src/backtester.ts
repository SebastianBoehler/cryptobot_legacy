import { differenceInMinutes, subDays } from "date-fns";
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
import {
  calculateBacktestResult,
  calculateProfit,
  logger,
  trailingStopLoss,
  waitAfterLoss,
} from "./utils";
import { Storage } from "./types/backtester";
import BigNumber from "bignumber.js";
const mongoClient = new mongo("admin");

const startTime: Date | null = subDays(new Date(), 30 * 5);

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
    "5min": new generateIndicators(exchange, symbol, 5),
    "15min": new generateIndicators(exchange, symbol, 15),
    "30min": new generateIndicators(exchange, symbol, 30),
    "1h": new generateIndicators(exchange, symbol, 60),
    "90min": new generateIndicators(exchange, symbol, 90),
    "4h": new generateIndicators(exchange, symbol, 60 * 4),
    "12h": new generateIndicators(exchange, symbol, 60 * 12),
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
    ] = await Promise.all([
      indicators["5min"].getIndicators(timestamp.getTime()),
      indicators["15min"].getIndicators(timestamp.getTime()),
      indicators["30min"].getIndicators(timestamp.getTime()),
      indicators["1h"].getIndicators(timestamp.getTime()),
      indicators["4h"].getIndicators(timestamp.getTime()),
      indicators["12h"].getIndicators(timestamp.getTime()),
    ]);
    if (!indicators_12h.ema_55) continue;
    if (startTime && startTime > timestamp) continue;

    const prev_indicators_5min = indicators["5min"].prevValues;
    const prev_indicators_15min = indicators["15min"].prevValues;
    const prev_indicators_30min = indicators["30min"].prevValues;
    const prev_indicators_1h = indicators["1h"].prevValues;
    const prev_indicators_4h = indicators["4h"].prevValues;
    const prev_indicators_12h = indicators["12h"].prevValues;

    if (
      !prev_indicators_5min ||
      !prev_indicators_15min ||
      !prev_indicators_30min ||
      !prev_indicators_1h ||
      !prev_indicators_4h ||
      !prev_indicators_12h
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
        trailingStopLossPercent: 1.5,
        high: highestPrice,
        low: lowestPrice,
      };

      //currently only support one step strategies
      const strategies: Record<(typeof strategyNames)[number], Rule> = {
        //! loosing 100%
        random: {
          isCorrelationTest: true,
          long_entry: [[Math.random().toFixed(1) === "0.5"]],
          long_exit: [
            [
              trailingStopLoss(trailingStopLossParams) ||
                netProfitInPercent > 3 * leverage ||
                holdDuration > 60 * 6,
            ],
          ],
          short_entry: [[Math.random().toFixed(1) === "0.5"]],
          short_exit: [
            [
              trailingStopLoss(trailingStopLossParams) ||
                netProfitInPercent > 3 * leverage ||
                holdDuration > 60 * 6,
            ],
          ],
        },
        "0_long": {
          isCorrelationTest: true,
          long_entry: [[holdDuration > 60 * 6 || !lastTrade]],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                holdDuration > 60 * 4,
            ],
          ],
          short_entry: [[false]],
          short_exit: [[false]],
        },
        "0_short": {
          isCorrelationTest: true,
          long_entry: [[false]],
          long_exit: [[false]],
          short_entry: [[holdDuration > 60 * 6 || !lastTrade]],
          short_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                holdDuration > 60 * 4,
            ],
          ],
        },
        // correlation only
        "1_long": {
          isCorrelationTest: true,
          long_entry: [[holdDuration > 60 * 3 || !lastTrade]],
          long_exit: [[holdDuration > 60 * 1]],
          short_entry: [[false]],
          short_exit: [[false]],
        },
        // correlation only
        "1_short": {
          isCorrelationTest: true,
          long_entry: [[false]],
          long_exit: [[false]],
          short_entry: [[holdDuration > 60 * 3 || !lastTrade]],
          short_exit: [[holdDuration > 60 * 1]],
        },
        //! loosing -13%
        "momentum-based-long": {
          long_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_4h.ADX.adx > 25 &&
                indicators_30min.RSI < 30 &&
                indicators_30min.OBV > indicators_30min.OBV_SMA,
            ],
          ],
          long_exit: [
            [
              close > indicators_30min.bollinger_bands.upper * 0.99 ||
                indicators_30min.RSI > 70 ||
                (!!indicators_30min.OBV &&
                  indicators_30min.OBV < indicators_30min.OBV_SMA) ||
                trailingStopLoss(trailingStopLossParams),
            ],
          ],
          short_entry: [[false]],
          short_exit: [[false]],
        },
        //! loosing -5%
        "momentum-based-short": {
          long_entry: [[false]],
          long_exit: [[false]],
          short_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_4h.ADX.adx > 25 &&
                indicators_30min.RSI > 70 &&
                indicators_30min.OBV < indicators_30min.OBV_SMA,
            ],
          ],
          short_exit: [
            [
              close < indicators_30min.bollinger_bands.lower * 1.01 ||
                indicators_30min.RSI < 30 ||
                (!!indicators_30min.OBV &&
                  indicators_30min.OBV > indicators_30min.OBV_SMA) ||
                trailingStopLoss(trailingStopLossParams),
            ],
          ],
        },
        //! loosing strategy avg -85%
        "momentum-based": {
          long_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_4h.ADX.adx > 25 &&
                indicators_30min.RSI < 30 &&
                indicators_30min.OBV > indicators_30min.OBV_SMA,
            ],
          ],
          long_exit: [
            [
              close > indicators_30min.bollinger_bands.upper * 0.99 ||
                indicators_30min.RSI > 70 ||
                (!!indicators_30min.OBV &&
                  indicators_30min.OBV < indicators_30min.OBV_SMA) ||
                trailingStopLoss(trailingStopLossParams),
            ],
          ],
          short_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_4h.ADX.adx > 25 &&
                indicators_30min.RSI > 70 &&
                indicators_30min.OBV < indicators_30min.OBV_SMA,
            ],
          ],
          short_exit: [
            [
              close < indicators_30min.bollinger_bands.lower * 1.01 ||
                indicators_30min.RSI < 30 ||
                (!!indicators_30min.OBV &&
                  indicators_30min.OBV > indicators_30min.OBV_SMA) ||
                trailingStopLoss(trailingStopLossParams),
            ],
          ],
        },
        //! loosing strategy avg -85%
        "momentum-based-closer-sl": {
          long_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_4h.ADX.adx > 25 &&
                indicators_30min.RSI < 30 &&
                indicators_30min.OBV > indicators_30min.OBV_SMA,
            ],
          ],
          long_exit: [
            [
              close > indicators_30min.bollinger_bands.upper * 0.99 ||
                indicators_30min.RSI > 70 ||
                (!!indicators_30min.OBV &&
                  indicators_30min.OBV < indicators_30min.OBV_SMA) ||
                trailingStopLoss(trailingStopLossParams),
            ],
          ],
          short_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_4h.ADX.adx > 25 &&
                indicators_30min.RSI > 70 &&
                indicators_30min.OBV < indicators_30min.OBV_SMA,
            ],
          ],
          short_exit: [
            [
              close < indicators_30min.bollinger_bands.lower * 1.01 ||
                indicators_30min.RSI < 30 ||
                (!!indicators_30min.OBV &&
                  indicators_30min.OBV > indicators_30min.OBV_SMA) ||
                trailingStopLoss(trailingStopLossParams),
            ],
          ],
        },
        //! loosing avg -8%
        "momentum-based-closer-sl-min": {
          long_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_4h.ADX.adx > 25 &&
                indicators_30min.RSI < 30 &&
                indicators_30min.OBV > indicators_30min.OBV_SMA &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 6),
            ],
          ],
          long_exit: [
            [
              close > indicators_30min.bollinger_bands.upper * 0.99 ||
                indicators_30min.RSI > 70 ||
                (!!indicators_30min.OBV &&
                  indicators_30min.OBV < indicators_30min.OBV_SMA) ||
                trailingStopLoss(trailingStopLossParams),
            ],
          ],
          short_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_4h.ADX.adx > 25 &&
                indicators_30min.RSI > 70 &&
                indicators_30min.OBV < indicators_30min.OBV_SMA &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 6),
            ],
          ],
          short_exit: [
            [
              close < indicators_30min.bollinger_bands.lower * 1.01 ||
                indicators_30min.RSI < 30 ||
                (!!indicators_30min.OBV &&
                  indicators_30min.OBV > indicators_30min.OBV_SMA) ||
                trailingStopLoss(trailingStopLossParams),
            ],
          ],
        },
        //! loosing avg -8%
        "momentum-based-closer-sl-min-tp": {
          long_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_4h.ADX.adx > 25 &&
                indicators_30min.RSI < 30 &&
                indicators_30min.OBV > indicators_30min.OBV_SMA &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 6),
            ],
          ],
          long_exit: [
            [
              close > indicators_30min.bollinger_bands.upper * 0.99 ||
                indicators_30min.RSI > 70 ||
                (!!indicators_30min.OBV &&
                  indicators_30min.OBV < indicators_30min.OBV_SMA) ||
                trailingStopLoss(trailingStopLossParams) ||
                netProfitInPercent > 15,
            ],
          ],
          short_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_4h.ADX.adx > 25 &&
                indicators_30min.RSI > 70 &&
                indicators_30min.OBV < indicators_30min.OBV_SMA &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 6),
            ],
          ],
          short_exit: [
            [
              close < indicators_30min.bollinger_bands.lower * 1.01 ||
                indicators_30min.RSI < 30 ||
                (!!indicators_30min.OBV &&
                  indicators_30min.OBV > indicators_30min.OBV_SMA) ||
                trailingStopLoss(trailingStopLossParams) ||
                netProfitInPercent > 15,
            ],
          ],
        },
        //! loosing avg -7%
        "momentum-based-closer-sl-min-tp-atr": {
          long_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_4h.ADX.adx > 25 &&
                indicators_30min.RSI < 30 &&
                indicators_30min.OBV > indicators_30min.OBV_SMA &&
                indicators_30min.ATR / close < 0.05 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 6),
            ],
          ],
          long_exit: [
            [
              close > indicators_30min.bollinger_bands.upper * 0.99 ||
                indicators_30min.RSI > 70 ||
                (!!indicators_30min.OBV &&
                  indicators_30min.OBV < indicators_30min.OBV_SMA) ||
                trailingStopLoss(trailingStopLossParams) ||
                netProfitInPercent > 15,
            ],
          ],
          short_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_4h.ADX.adx > 25 &&
                indicators_30min.RSI > 70 &&
                indicators_30min.OBV < indicators_30min.OBV_SMA &&
                indicators_30min.ATR / close < 0.05 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 6),
            ],
          ],
          short_exit: [
            [
              close < indicators_30min.bollinger_bands.lower * 1.01 ||
                indicators_30min.RSI < 30 ||
                (!!indicators_30min.OBV &&
                  indicators_30min.OBV > indicators_30min.OBV_SMA) ||
                trailingStopLoss(trailingStopLossParams) ||
                netProfitInPercent > 15,
            ],
          ],
        },
        //! loosing avg -39%
        "simple-ema": {
          long_entry: [
            [
              indicators_30min.ema_8 < indicators_30min.ema_21 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
            [
              indicators_1h.ema_8 > indicators_1h.ema_55 &&
                indicators_30min.ema_8 > indicators_30min.ema_21 &&
                indicators_30min.OBV_RSI < 35,
            ],
          ],
          long_exit: [
            [
              indicators_30min.OBV_RSI > 70 ||
                trailingStopLoss(trailingStopLossParams),
            ],
          ],
          short_entry: [
            [
              indicators_30min.ema_8 > indicators_30min.ema_21 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
            [
              indicators_1h.ema_8 < indicators_1h.ema_55 &&
                indicators_30min.ema_8 < indicators_30min.ema_21 &&
                indicators_30min.OBV_RSI > 65,
            ],
          ],
          short_exit: [
            [
              indicators_30min.OBV_RSI < 30 ||
                trailingStopLoss(trailingStopLossParams),
            ],
          ],
        },
        //! loosing avg -65%
        "simple-macd": {
          long_entry: [
            [
              indicators_30min.MACD.histogram < 0 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
            [
              indicators_4h.ema_8 > indicators_4h.ema_55 &&
                indicators_30min.MACD.histogram > 0 &&
                indicators_30min.MACD.histogram >
                  prev_indicators_30min.MACD.histogram,
            ],
          ],
          long_exit: [
            [
              indicators_30min.MACD.histogram < 0 ||
                trailingStopLoss(trailingStopLossParams) ||
                holdDuration > 60 * 12,
            ],
          ],
          short_entry: [
            [
              indicators_30min.MACD.histogram > 0 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
            [
              indicators_4h.ema_8 < indicators_4h.ema_55 &&
                indicators_30min.MACD.histogram < 0 &&
                indicators_30min.MACD.histogram <
                  prev_indicators_30min.MACD.histogram,
            ],
          ],
          short_exit: [
            [
              indicators_30min.MACD.histogram > 0 ||
                trailingStopLoss(trailingStopLossParams) ||
                holdDuration > 60 * 12,
            ],
          ],
        },
        //! loosing avg -65%
        "simple-ema-tp": {
          long_entry: [
            [
              indicators_30min.ema_8 < indicators_30min.ema_21 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
            [
              indicators_1h.ema_8 > indicators_1h.ema_55 &&
                indicators_30min.ema_8 > indicators_30min.ema_21 &&
                indicators_30min.OBV_RSI < 35,
            ],
          ],
          long_exit: [
            [
              indicators_30min.OBV_RSI > 70 ||
                trailingStopLoss(trailingStopLossParams) ||
                netProfitInPercent > 10,
            ],
          ],
          short_entry: [
            [
              indicators_30min.ema_8 > indicators_30min.ema_21 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
            [
              indicators_1h.ema_8 < indicators_1h.ema_55 &&
                indicators_30min.ema_8 < indicators_30min.ema_21 &&
                indicators_30min.OBV_RSI > 65,
            ],
          ],
          short_exit: [
            [
              indicators_30min.OBV_RSI < 30 ||
                trailingStopLoss(trailingStopLossParams) ||
                netProfitInPercent > 10,
            ],
          ],
        },
        //! loosing avg -65%
        "simple-ema-tp-4h": {
          long_entry: [
            [
              indicators_30min.ema_8 < indicators_30min.ema_21 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
            [
              indicators_4h.ema_8 > indicators_4h.ema_21 &&
                indicators_30min.ema_8 > indicators_30min.ema_21 &&
                indicators_30min.OBV_RSI < 35,
            ],
          ],
          long_exit: [
            [
              indicators_30min.OBV_RSI > 70 ||
                trailingStopLoss(trailingStopLossParams) ||
                netProfitInPercent > 10,
            ],
          ],
          short_entry: [
            [
              indicators_30min.ema_8 > indicators_30min.ema_21 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
            [
              indicators_4h.ema_8 < indicators_4h.ema_21 &&
                indicators_30min.ema_8 < indicators_30min.ema_21 &&
                indicators_30min.OBV_RSI > 65,
            ],
          ],
          short_exit: [
            [
              indicators_30min.OBV_RSI < 30 ||
                trailingStopLoss(trailingStopLossParams) ||
                netProfitInPercent > 10,
            ],
          ],
        },
        //! loosing avg -65%
        "simple-macd-tp": {
          long_entry: [
            [
              indicators_30min.MACD.histogram < 0 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
            [
              indicators_4h.ema_8 > indicators_4h.ema_55 &&
                indicators_30min.MACD.histogram > 0 &&
                indicators_30min.MACD.histogram >
                  prev_indicators_30min.MACD.histogram,
            ],
          ],
          long_exit: [
            [
              indicators_30min.MACD.histogram < 0 ||
                trailingStopLoss(trailingStopLossParams) ||
                holdDuration > 60 * 12 ||
                netProfitInPercent > 10,
            ],
          ],
          short_entry: [
            [
              indicators_30min.MACD.histogram > 0 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
            [
              indicators_4h.ema_8 < indicators_4h.ema_55 &&
                indicators_30min.MACD.histogram < 0 &&
                indicators_30min.MACD.histogram <
                  prev_indicators_30min.MACD.histogram,
            ],
          ],
          short_exit: [
            [
              indicators_30min.MACD.histogram > 0 ||
                trailingStopLoss(trailingStopLossParams) ||
                holdDuration > 60 * 12 ||
                netProfitInPercent > 10,
            ],
          ],
        },
        //! loosing avg -65%
        "simple-macd-tp-4h": {
          long_entry: [
            [
              indicators_30min.MACD.histogram < 0 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
            [
              indicators_4h.ema_8 > indicators_4h.ema_55 &&
                indicators_30min.MACD.histogram > 0 &&
                indicators_30min.MACD.histogram >
                  prev_indicators_30min.MACD.histogram,
            ],
          ],
          long_exit: [
            [
              indicators_30min.MACD.histogram < 0 ||
                trailingStopLoss(trailingStopLossParams) ||
                holdDuration > 60 * 12 ||
                netProfitInPercent > 10,
            ],
          ],
          short_entry: [
            [
              indicators_30min.MACD.histogram > 0 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
            [
              indicators_4h.ema_8 < indicators_4h.ema_55 &&
                indicators_30min.MACD.histogram < 0 &&
                indicators_30min.MACD.histogram <
                  prev_indicators_30min.MACD.histogram,
            ],
          ],
          short_exit: [
            [
              indicators_30min.MACD.histogram > 0 ||
                trailingStopLoss(trailingStopLossParams) ||
                holdDuration > 60 * 12 ||
                netProfitInPercent > 10,
            ],
          ],
        },
        //! loosing -19
        "scalping-obv-5min": {
          long_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_5min.MACD.histogram >
                  prev_indicators_5min.MACD.histogram &&
                indicators_30min.RSI < 30 &&
                indicators_30min.OBV > indicators_30min.OBV_SMA &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                holdDuration > 60 * 12,
            ],
          ],
          short_entry: [
            [
              !!indicators_30min.OBV &&
                indicators_5min.MACD.histogram <
                  prev_indicators_5min.MACD.histogram &&
                indicators_30min.RSI > 70 &&
                indicators_30min.OBV < indicators_30min.OBV_SMA &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          short_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                holdDuration > 60 * 12,
            ],
          ],
        },
        //! loosing avg -14%
        "scalping-obv-5min-1h": {
          long_entry: [
            [
              !!indicators_1h.OBV &&
                indicators_5min.MACD.histogram >
                  prev_indicators_5min.MACD.histogram &&
                indicators_1h.RSI < 30 &&
                indicators_1h.OBV > indicators_1h.OBV_SMA &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                holdDuration > 60 * 12,
            ],
          ],
          short_entry: [
            [
              !!indicators_1h.OBV &&
                indicators_5min.MACD.histogram <
                  prev_indicators_5min.MACD.histogram &&
                indicators_1h.RSI > 70 &&
                indicators_1h.OBV < indicators_1h.OBV_SMA &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          short_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                holdDuration > 60 * 12,
            ],
          ],
        },
        "scalping-obv-5min-1h-long": {
          long_entry: [
            [
              !!indicators_1h.OBV &&
                indicators_5min.MACD.histogram >
                  prev_indicators_5min.MACD.histogram &&
                indicators_1h.RSI < 30 &&
                indicators_1h.OBV > indicators_1h.OBV_SMA &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                holdDuration > 60 * 12,
            ],
          ],
          short_entry: [[false]],
          short_exit: [[false]],
        },
        //! loosing avg -60%
        "scalping-macd-5min-4h": {
          long_entry: [
            [
              indicators_4h.MACD.histogram >
                prev_indicators_4h.MACD.histogram &&
                indicators_5min.RSI < 30 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                holdDuration > 60 * 12,
            ],
          ],
          short_entry: [
            [
              indicators_4h.MACD.histogram <
                prev_indicators_4h.MACD.histogram &&
                indicators_5min.RSI > 70 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          short_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                holdDuration > 60 * 12,
            ],
          ],
        },
        //! loosing avg -27%
        "scalping-macd-5min": {
          long_entry: [
            [
              indicators_1h.MACD.histogram > 0 &&
                indicators_1h.MACD.histogram >
                  prev_indicators_1h.MACD.histogram &&
                indicators_5min.RSI < 30 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                holdDuration > 60 * 12,
            ],
          ],
          short_entry: [
            [
              indicators_1h.MACD.histogram < 0 &&
                indicators_1h.MACD.histogram <
                  prev_indicators_1h.MACD.histogram &&
                indicators_5min.RSI > 70 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          short_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                holdDuration > 60 * 12,
            ],
          ],
        },
        //! loosing avg -13%
        "scalping-macd-5min-30min": {
          long_entry: [
            [
              indicators_30min.MACD.histogram > 0 &&
                indicators_30min.MACD.histogram >
                  prev_indicators_30min.MACD.histogram &&
                indicators_5min.RSI < 30 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                holdDuration > 60 * 12,
            ],
          ],
          short_entry: [
            [
              indicators_30min.MACD.histogram < 0 &&
                indicators_30min.MACD.histogram <
                  prev_indicators_30min.MACD.histogram &&
                indicators_5min.RSI > 70 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          short_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                holdDuration > 60 * 12,
            ],
          ],
        },
        //! loosing avg -5%
        "scalping-macd-5min-30min-tighter": {
          long_entry: [
            [
              indicators_30min.MACD.histogram > 0 &&
                indicators_30min.MACD.histogram >
                  prev_indicators_30min.MACD.histogram &&
                indicators_5min.RSI < 30 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 0.5,
              }) ||
                netProfitInPercent > 1 * leverage ||
                holdDuration > 60 * 6,
            ],
          ],
          short_entry: [
            [
              indicators_30min.MACD.histogram < 0 &&
                indicators_30min.MACD.histogram <
                  prev_indicators_30min.MACD.histogram &&
                indicators_5min.RSI > 70 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          short_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 0.5,
              }) ||
                netProfitInPercent > 1 * leverage ||
                holdDuration > 60 * 6,
            ],
          ],
        },
        "scalping-macd-5min-30min-tighter-long": {
          long_entry: [
            [
              indicators_30min.MACD.histogram > 0 &&
                indicators_30min.MACD.histogram >
                  prev_indicators_30min.MACD.histogram &&
                indicators_5min.RSI < 30 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 0.5,
              }) ||
                netProfitInPercent > 1 * leverage ||
                holdDuration > 60 * 6,
            ],
          ],
          short_entry: [[false]],
          short_exit: [[false]],
        },
        //! loosing avg -5%
        "scalping-macd-5min-30min-tighter-short": {
          long_entry: [[false]],
          long_exit: [[false]],
          short_entry: [
            [
              indicators_30min.MACD.histogram < 0 &&
                indicators_30min.MACD.histogram <
                  prev_indicators_30min.MACD.histogram &&
                indicators_5min.RSI > 70 &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          short_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 0.5,
              }) ||
                netProfitInPercent > 1 * leverage ||
                holdDuration > 60 * 6,
            ],
          ],
        },
        //! loosing avg -9%
        "scalping-obv-5min-1h-tighter": {
          long_entry: [
            [
              !!indicators_1h.OBV &&
                indicators_5min.MACD.histogram >
                  prev_indicators_5min.MACD.histogram &&
                indicators_1h.RSI < 30 &&
                indicators_1h.OBV > indicators_1h.OBV_SMA &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 0.5,
              }) ||
                netProfitInPercent > 1 * leverage ||
                holdDuration > 60 * 12,
            ],
          ],
          short_entry: [
            [
              !!indicators_1h.OBV &&
                indicators_5min.MACD.histogram <
                  prev_indicators_5min.MACD.histogram &&
                indicators_1h.RSI > 70 &&
                indicators_1h.OBV < indicators_1h.OBV_SMA &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          short_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 0.5,
              }) ||
                netProfitInPercent > 1 * leverage ||
                holdDuration > 60 * 12,
            ],
          ],
        },
        //! loosing avg -33%
        "scalping-macd-rsi": {
          long_entry: [
            [
              indicators_5min.MACD.histogram > 0 &&
                indicators_5min.RSI < 30 &&
                indicators_4h.HA.o < indicators_4h.HA.c &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                (netProfitInPercent < 0 && holdDuration > 60 * 2),
              holdDuration > 60 * 6,
            ],
          ],
          short_entry: [
            [
              indicators_5min.MACD.histogram < 0 &&
                indicators_5min.RSI > 70 &&
                indicators_4h.HA.o > indicators_4h.HA.c &&
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          short_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                (netProfitInPercent < 0 && holdDuration > 60 * 2),
              holdDuration > 60 * 6,
            ],
          ],
        },
        //! loosing avg -9%
        "scalping-macd-rsi-atr": {
          long_entry: [
            [
              indicators_5min.MACD.histogram > 0 &&
                indicators_5min.RSI < 30 &&
                indicators_4h.HA.o > indicators_4h.HA.c &&
                indicators_30min.ATR / close > 0.015 && // Increased volatility (ATR as a percentage)
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                (netProfitInPercent < 0 && holdDuration > 60 * 2),
              holdDuration > 60 * 6,
            ],
          ],
          short_entry: [
            [
              indicators_5min.MACD.histogram < 0 &&
                indicators_5min.RSI > 70 &&
                indicators_4h.HA.o < indicators_4h.HA.c &&
                indicators_30min.ATR / close > 0.015 && // Increased volatility (ATR as a percentage)
                waitAfterLoss(lastTrade, holdDuration, 30 * 5),
            ],
          ],
          short_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 1,
              }) ||
                netProfitInPercent > 2 * leverage ||
                (netProfitInPercent < 0 && holdDuration > 60 * 2),
              holdDuration > 60 * 6,
            ],
          ],
        },
        "horizontal-volatility": {
          long_entry: [
            [
              indicators_5min.RSI < 40 && // Oversold condition
                indicators_5min.ATR / close > 0.015 && // Increased volatility (ATR as a percentage)
                close < indicators_5min.bollinger_bands.lower * 1.005, // Near lower Bollinger Band
            ],
          ],
          long_exit: [
            [
              close > indicators_5min.bollinger_bands.middle || // Price moves above middle Bollinger Band
                trailingStopLoss(trailingStopLossParams) || // Trailing stop loss triggered
                netProfitInPercent > 1.5 * leverage || // Take profit at 1.5% net profit
                holdDuration > 60 * 6, // Hold for a maximum of 6 hours
            ],
          ],
          short_entry: [
            [
              indicators_5min.RSI > 60 && // Overbought condition
                indicators_5min.ATR / close > 0.015 && // Increased volatility (ATR as a percentage)
                close > indicators_5min.bollinger_bands.upper * 0.995, // Near upper Bollinger Band
            ],
          ],
          short_exit: [
            [
              close < indicators_5min.bollinger_bands.middle || // Price moves below middle Bollinger Band
                trailingStopLoss(trailingStopLossParams) || // Trailing stop loss triggered
                netProfitInPercent > 1.5 * leverage || // Take profit at 1.5% net profit
                holdDuration > 60 * 6, // Hold for a maximum of 6 hours
            ],
          ],
        },
        "horizontal-volatility-increased-long": {
          long_entry: [
            [
              indicators_5min.RSI < 40 && // Oversold condition
                indicators_5min.ATR / close > 0.03 && // Increased volatility (ATR as a percentage)
                close < indicators_5min.bollinger_bands.lower * 1.005, // Near lower Bollinger Band
            ],
          ],
          long_exit: [
            [
              close > indicators_5min.bollinger_bands.middle || // Price moves above middle Bollinger Band
                trailingStopLoss(trailingStopLossParams) || // Trailing stop loss triggered
                netProfitInPercent > 1.5 * leverage || // Take profit at 1.5% net profit
                holdDuration > 60 * 6, // Hold for a maximum of 6 hours
            ],
          ],
          short_entry: [[false]],
          short_exit: [[false]],
        },
        "horizontal-volatility-increased-short": {
          long_entry: [[false]],
          long_exit: [[false]],
          short_entry: [
            [
              indicators_5min.RSI > 60 && // Overbought condition
                indicators_5min.ATR / close > 0.03 && // Increased volatility (ATR as a percentage)
                close > indicators_5min.bollinger_bands.upper * 0.995, // Near upper Bollinger Band
            ],
          ],
          short_exit: [
            [
              close < indicators_5min.bollinger_bands.middle || // Price moves below middle Bollinger Band
                trailingStopLoss(trailingStopLossParams) || // Trailing stop loss triggered
                netProfitInPercent > 1.5 * leverage || // Take profit at 1.5% net profit
                holdDuration > 60 * 6, // Hold for a maximum of 6 hours
            ],
          ],
        },
        //! loosing avg -100%
        "trend-momentum-combo": {
          long_entry: [
            [
              indicators_30min.ema_8 > indicators_30min.ema_21 && // EMA crossover
                indicators_30min.MACD.histogram > 0 && // Positive MACD histogram
                waitAfterLoss(lastTrade, holdDuration, 30 * 5), // Wait after a loss
            ],
          ],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 0.5, // Tighter trailing stop loss
              }) ||
                netProfitInPercent > 1.5 * leverage || // Take profit at 1.5% net profit
                holdDuration > 60 * 6, // Hold for a maximum of 6 hours
            ],
          ],
          short_entry: [
            [
              indicators_30min.ema_8 < indicators_30min.ema_21 && // EMA crossover
                indicators_30min.MACD.histogram < 0 && // Negative MACD histogram
                waitAfterLoss(lastTrade, holdDuration, 30 * 5), // Wait after a loss
            ],
          ],
          short_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 0.5, // Tighter trailing stop loss
              }) ||
                netProfitInPercent > 1.5 * leverage || // Take profit at 1.5% net profit
                holdDuration > 60 * 6, // Hold for a maximum of 6 hours
            ],
          ],
        },
        //! loosing avg -100%
        "range-breakout": {
          long_entry: [
            [
              close > indicators_4h.bollinger_bands.middle && // Above middle Bollinger Band
                close < indicators_4h.bollinger_bands.upper && // Below upper Bollinger Band
                indicators_1h.RSI > 30 && // RSI above 30 (avoid oversold)
                waitAfterLoss(lastTrade, holdDuration, 30 * 5), // Wait after a loss
            ],
          ],
          long_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 0.5, // Tighter trailing stop loss
              }) ||
                netProfitInPercent > 1.5 * leverage || // Take profit at 1.5% net profit
                holdDuration > 60 * 6 || // Hold for a maximum of 6 hours
                close < indicators_4h.bollinger_bands.middle, // Below middle Bollinger Band
            ],
          ],
          short_entry: [
            [
              close < indicators_4h.bollinger_bands.middle && // Below middle Bollinger Band
                close > indicators_4h.bollinger_bands.lower && // Above lower Bollinger Band
                indicators_1h.RSI < 70 && // RSI below 70 (avoid overbought)
                waitAfterLoss(lastTrade, holdDuration, 30 * 5), // Wait after a loss
            ],
          ],
          short_exit: [
            [
              trailingStopLoss({
                ...trailingStopLossParams,
                trailingStopLossPercent: 0.5, // Tighter trailing stop loss
              }) ||
                netProfitInPercent > 1.5 * leverage || // Take profit at 1.5% net profit
                holdDuration > 60 * 6 || // Hold for a maximum of 6 hours
                close > indicators_4h.bollinger_bands.middle, // Above middle Bollinger Band
            ],
          ],
        },
        //! loosing avg -100%
        "vwap-trend-following": {
          long_entry: [
            [
              !!indicators_1h.VWAP &&
                !!prev_indicators_1h.VWAP &&
                close > indicators_1h.VWAP && // Price above VWAP
                indicators_1h.VWAP > prev_indicators_1h.VWAP && // VWAP trending up
                waitAfterLoss(lastTrade, holdDuration, 30 * 5), // Wait after a loss
            ],
          ],
          long_exit: [
            [
              trailingStopLoss(trailingStopLossParams) ||
                netProfitInPercent > 2 * leverage || // Take profit at 2% net profit
                holdDuration > 60 * 6 || // Hold for a maximum of 6 hours
                (!!indicators_1h.VWAP && close < indicators_1h.VWAP), // Price below VWAP
            ],
          ],
          short_entry: [
            [
              !!indicators_1h.VWAP &&
                !!prev_indicators_1h.VWAP &&
                close < indicators_1h.VWAP && // Price below VWAP
                indicators_1h.VWAP < prev_indicators_1h.VWAP && // VWAP trending down
                waitAfterLoss(lastTrade, holdDuration, 30 * 5), // Wait after a loss
            ],
          ],
          short_exit: [
            [
              trailingStopLoss(trailingStopLossParams) ||
                netProfitInPercent > 2 * leverage || // Take profit at 2% net profit
                holdDuration > 60 * 6 || // Hold for a maximum of 6 hours
                (!!indicators_1h.VWAP && close > indicators_1h.VWAP), // Price above VWAP
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
            variant1: item.RSI < 35 && item.ema_8 > item.ema_55,
            variant2: item.RSI > 65 && item.ema_8 < item.ema_55,
            variant3:
              item.RSI < 35 &&
              item.ema_8 / item.ema_55 > prev.ema_8 / prev.ema_55,
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
      start,
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
