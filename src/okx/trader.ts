import { differenceInMinutes, subMinutes } from "date-fns";
import { generateIndicators } from "../generateIndicators";
import {
  calculateProfit,
  checkHasOpenPosition,
  createUniqueId,
  logger,
  sleep,
  toDecimals,
} from "../utils";
import { OkxClient } from "./utils";
import config from "../config/config";
import Mongo from "../mongodb";
import {
  BaseOrderObject,
  EntryOrderTypes,
  Exchanges,
  Rule,
} from "../types/trading";

process.on("unhandledRejection", (reason, p) => {
  logger.error("Unhandled Rejection at: Promise", p, "reason:", reason);
});

//TODO: credentials into env

const mongo = new Mongo("trader");
const okxClient = new OkxClient();
const exchange: Exchanges = "okx";
const symbol = "COMP-USDT-SWAP";
const startCapital = 50;
const leverage = config.LEVERAGE;
let minSize: number = 1;
let lotSize: string = "0.001"; //decimals of amount
let tickSize: string = "0.001"; //decimals of price
let ctVal: string = "0.1"; //contract value

const indicators = {
  "25min": new generateIndicators(exchange, symbol, 25),
  "60min": new generateIndicators(exchange, symbol, 60),
  "2h": new generateIndicators(exchange, symbol, 60 * 2),
};

let accountBalance: number | null;
const storage = {
  trades: [],
  long_entry: 0,
  long_exit: 0,
  short_entry: 0,
  short_exit: 0,
};

const resetStorage = () => {
  //storage.trades = [];
  storage.long_entry = 0;
  storage.long_exit = 0;
  storage.short_entry = 0;
  storage.short_exit = 0;
};

async function placeEntry(
  netInvest: number,
  price: number,
  object: BaseOrderObject,
  type: EntryOrderTypes
) {
  const priceDecimalPlaces = tickSize.split(".")[1]?.length || 0;
  const sizeDecimalPlaces = lotSize.split(".")[1]?.length || 0;

  //calculate multiplier: if ctVal has 1 decimals = 10, if ctVal has 2 decimals = 100
  const multiplier = 10 ** ctVal.split(".")[1].length;
  const amount = (netInvest * leverage * multiplier) / price;
  if (amount < minSize) throw new Error("Order size too small");
  logger.debug(amount, netInvest * leverage, price, amount.toFixed(3));

  const side = type.includes("Long") ? "buy" : "sell";

  const tpChange = 0.04; //4%
  const slChange = 0.02; //2%
  const tpFactor = type.includes("Long") ? 1 + tpChange : 1 - tpChange; //5% price change profit
  const slFactor = type.includes("Long") ? 1 - slChange : 1 + slChange; //2.5% price change loss

  const size = toDecimals(amount, sizeDecimalPlaces);
  const maxSlippagePrice = side === "buy" ? price * 1.01 : price * 0.99; //1% slippage

  await okxClient.placeIOCOrder(
    symbol,
    side,
    size,
    object.clOrdId,
    String(maxSlippagePrice),
    {
      tpTriggerPx: String(toDecimals(price * tpFactor, priceDecimalPlaces)), // to be safe
      tpOrdPx: "-1", //market order
    },
    {
      slTriggerPx: String(toDecimals(price * slFactor, priceDecimalPlaces)), // to be safe
      slOrdPx: "-1", //market order
    }
  );

  await sleep(200);
  const details = await okxClient.getOrderDetails(object.clOrdId!, symbol);

  const positionSize = (+details.sz / multiplier) * +details.avgPx;
  await mongo.writeTransaction(symbol, exchange, {
    ...object,
    price: +details.avgPx,
    positionSize,
    netPositionSize: positionSize / leverage,
    holdDuration: 0,
    fee: Math.abs(+details.fee),
    type,
    leverage: +details.lever,
  });
  resetStorage();
}

async function trader() {
  const lastTickerDiff = differenceInMinutes(
    new Date(),
    new Date(+(okxClient.lastTicker?.ts ?? `0`))
  );
  if (lastTickerDiff > 5) {
    okxClient.lastTicker = null;
  }
  if (!okxClient.lastTicker) {
    logger.debug("No ticker data");
    const channels = okxClient.subscriptions;
    const isSubscribed = channels.find(
      ({ channel, instId }) => channel === "tickers" && instId === symbol
    );
    if (!isSubscribed) {
      logger.debug("Subscribing to ticker data inside trader");
      await okxClient.subscribeToPriceData(symbol);
    }
    return;
  }
  const lastTrade = await mongo.getLatestTransaction(symbol, exchange);
  const hasOpenPosition = checkHasOpenPosition(lastTrade);
  const holdDuration = lastTrade
    ? differenceInMinutes(new Date(), lastTrade.timestamp)
    : 0;

  const [indicators_25min, indicators_60min, indicators_2h] = await Promise.all(
    [
      indicators["25min"].getIndicators(new Date().getTime()),
      indicators["60min"].getIndicators(new Date().getTime()),
      indicators["2h"].getIndicators(new Date().getTime()),
    ]
  );

  logger.debug("candle", okxClient.candel1m.slice(-1));

  const prev_indicators_60min = indicators["60min"].prevValues;
  const prev_indicators_25min = indicators["25min"].prevValues;
  const price = +okxClient.candel1m.slice(-1)[0].close;
  const spread = +okxClient.lastTicker.askPx / +okxClient.lastTicker.bidPx - 1; // always >0

  //fee not included here
  const netProfitInPercent = +(okxClient.pnl?.profit || 0) * 100;

  const exit =
    netProfitInPercent > 3 * leverage || netProfitInPercent < -1.5 * leverage;

  const strategy: Rule = {
    long_entry: [
      [price < indicators_25min.bollinger_bands.lower],
      [
        !!prev_indicators_25min &&
          !!prev_indicators_60min &&
          price > indicators_25min.bollinger_bands.lower &&
          indicators_60min.MACD.histogram >
            prev_indicators_60min.MACD.histogram,
      ],
    ],
    long_exit: [[exit || holdDuration >= 60 * 12]],
    short_entry: [
      [price > indicators_25min.bollinger_bands.upper],
      [
        !!prev_indicators_25min &&
          !!prev_indicators_60min &&
          price < indicators_25min.bollinger_bands.upper &&
          indicators_60min.MACD.histogram <
            prev_indicators_60min.MACD.histogram,
      ],
    ],
    short_exit: [[exit || holdDuration > 60 * 12]],
  };

  //check trigger conditions
  if (strategy.long_entry[storage.long_entry]?.every((cond) => cond))
    storage.long_entry++;
  if (strategy.long_exit[storage.long_exit]?.every((cond) => cond))
    storage.long_exit++;
  if (strategy.short_entry[storage.short_entry]?.every((cond) => cond))
    storage.short_entry++;
  if (strategy.short_exit[storage.short_exit]?.every((cond) => cond))
    storage.short_exit++;

  const netInvest = lastTrade?.netInvest || startCapital;
  const object = {
    timestamp: new Date(),
    platform: exchange,
    invest: netInvest * leverage,
    netInvest,
    clOrdId: createUniqueId(32),
    details: {
      indicators_25min,
      indicators_60min,
      indicators_2h,
      candle: okxClient.candel1m.slice(-1)[0],
      strategy,
      storage,
    },
    spread,
  };

  if (!hasOpenPosition) {
    const longEntry = storage.long_entry >= strategy.long_entry.length;
    const shortEntry = storage.short_entry >= strategy.short_entry.length;
    logger.info(
      `Waiting for entry trigger: ${storage.long_entry} ${storage.short_entry}`
    );

    if (longEntry) placeEntry(netInvest, price, object, "Long Entry");
    if (shortEntry) placeEntry(netInvest, price, object, "Short Entry");
  }

  if (hasOpenPosition) {
    logger.info({
      netProfitInPercent: netProfitInPercent.toFixed(2),
      holdDuration,
      priceChangePercent: ((price / lastTrade!.price - 1) * 100).toFixed(2),
    });
    //matches, even more accurate by a few decimal places and includes fees
    //const calculated = await calculateProfit(exchange, lastTrade!, price);
    const longExit = storage.long_exit >= strategy.long_exit.length;
    const shortExit = storage.short_exit >= strategy.short_exit.length;
    if (longExit || shortExit) {
      await okxClient.closePosition(symbol, object.clOrdId);
      await sleep(200);
      const multiplier = 10 ** ctVal.split(".")[1].length;

      const details = await okxClient.getOrderDetails(object.clOrdId, symbol);
      const fee = Math.abs(+details.fee);
      const pnl = +details.pnl; //absolute profit in usd

      const netProfit = pnl - (fee + lastTrade!.fee);
      const profit = pnl / lastTrade!.invest;

      const calcProfit = await calculateProfit(
        "okx",
        lastTrade!,
        +details.avgPx
      );
      const type = longExit ? "Long Exit" : "Short Exit";
      const positionSize = (+details.avgPx * +details.accFillSz) / multiplier;
      //fee included here
      const netProfitInPercent = (netProfit / lastTrade.netInvest) * 100;

      await mongo.writeTransaction(symbol, exchange, {
        ...object,
        type,
        price: +details.avgPx,
        invest: lastTrade.invest + netProfit,
        netInvest: lastTrade.netInvest + netProfit,
        positionSize,
        netPositionSize: positionSize / leverage,
        holdDuration,
        profit,
        priceChangePercent: calcProfit.priceChangePercent,
        netProfitInPercent,
        fee,
        isLiquidated: false,
        netProfit,
        details: {
          ...object.details,
          calcProfit,
        },
        leverage: +details.lever,
      });
      resetStorage();
    }
  }
}

async function main() {
  logger.info(`Starting trader for ${symbol} on ${exchange}`);
  for (let i = 0; i < 9_000; i++) {
    const timestamp = subMinutes(new Date(), 9_000 - i);
    //logger.debug(`Time: ${timestamp.toLocaleString()}`);
    for (const [_key, indicator] of Object.entries(indicators)) {
      await indicator.getIndicators(timestamp.getTime());
    }
  }

  //get Account Balance
  const account = await okxClient.getAccountBalance();
  const USDT = account[0].details.find((detail) => detail.ccy === "USDT");
  if (!USDT) throw new Error("No USDT Balance found");
  accountBalance = +USDT.availBal;
  if (accountBalance < startCapital)
    throw new Error("Not enough USDT Balance, pls reduce startCapital");

  //check if position is open
  const lastTrade = await mongo.getLatestTransaction(symbol, exchange);
  const positions = await okxClient.getPositions(symbol);
  const openPositions = positions.filter((position) => position.upl !== "");
  if (
    openPositions.length > 0 &&
    lastTrade &&
    lastTrade.type.includes("Exit")
  ) {
    throw new Error(`There is a unknown position open`);
  }

  //set leverage | only works if no position is open
  await okxClient.setLeverage(symbol, leverage).catch((err) => {
    logger.warn(`Failed to set leverage: ${err.message}`);
  });

  okxClient.subscribeToPriceData(symbol);
  okxClient.subscribeToPositionData(symbol);

  const instruments = await okxClient.getInstruments();
  const instrument = instruments.find((i) => i.instId === symbol);
  if (!instrument) throw new Error("No instrument found");
  minSize = +instrument.minSz;
  lotSize = instrument.lotSz;
  tickSize = instrument.tickSz;
  ctVal = instrument.ctVal;

  await sleep(1000 * 2);
  while (true) {
    trader();
    await sleep(1000 * 10);
  }
}

main();
