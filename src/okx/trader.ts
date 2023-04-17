import { differenceInMinutes, subMinutes } from "date-fns";
import { generateIndicators } from "../generateIndicators";
import { calculateProfit, createUniqueId, logger, sleep } from "../utils";
import { OkxClient } from "./utils";
import config from "../config/config";
import Mongo from "../mongodb";
import { Exchanges, Rule } from "../types/trading";

process.on("unhandledRejection", (reason, p) => {
  logger.error("Unhandled Rejection at: Promise", p, "reason:", reason);
});

//TODO: support shorts
//TODO: check if netProfitInPercent * leverage is the correct trigger
//TODO: create functions for long/short entry/exit

//TODO: wait for okx-npm merge
//TODO: credentials into env

const mongo = new Mongo("trader");
const okxClient = new OkxClient();
const exchange: Exchanges = "okx";
const symbol = "GMT-USDT-SWAP";
const startCapital = 50;
const leverage = config.LEVERAGE;
let minSize: number = 1;
let lotSize: number = 1;
let tickSize: string = "0.001"; //decimals of price

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

async function trader() {
  if (!okxClient.lastTicker) {
    logger.debug("No ticker data");
    return;
  }
  const priceDecimalPlaces = tickSize.split(".")[1].length;
  const lastTrade = await mongo.getLatestTransaction(symbol, exchange);
  const hasOpenPosition = lastTrade ? lastTrade.type.includes("Entry") : false;
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

  const prev_indicators_60min = indicators["60min"].prevValues;
  const prev_indicators_2h = indicators["2h"].prevValues;
  const price = +okxClient.lastTicker.last;
  const spread = +okxClient.lastTicker.askPx / +okxClient.lastTicker.bidPx - 1; // always >0

  //fee not included here
  const netProfitInPercent = +(okxClient.pnl?.profit || 0) * 100;

  const exit =
    netProfitInPercent > 5 * leverage || netProfitInPercent < -2.5 * leverage;

  const strategy: Rule = {
    long_entry: [[true]],
    long_exit: [[exit]],
    short_entry: [
      [price > indicators_25min.bollinger_bands.upper],
      [
        !!prev_indicators_60min &&
          !!prev_indicators_2h &&
          price < indicators_60min.bollinger_bands.upper &&
          indicators_2h.MACD.histogram < prev_indicators_2h.MACD.histogram,
      ],
    ],
    short_exit: [[exit]],
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
    },
    spread,
  };

  if (!hasOpenPosition) {
    const longEntry = storage.long_entry >= strategy.long_entry.length;
    //const shortEntry = storage.short_entry >= strategy.short_entry.length;

    if (longEntry) {
      const amount = (netInvest * leverage) / price;
      if (amount < minSize) throw new Error("Order size too small");
      logger.debug(amount, netInvest * leverage, price, amount.toFixed(3));
      await okxClient.placeMarketOrder(
        symbol,
        "buy",
        //TODO: get notional value from config
        amount.toFixed(lotSize),
        object.clOrdId,
        //places tp, sp a few percent above/below rule execution price to be safe
        //TODO: config should include decimal places
        {
          tpTriggerPx: (price * (1 + 0.052)).toFixed(priceDecimalPlaces), // to be safe
          tpOrdPx: "-1", //market order
        },
        {
          slTriggerPx: (price * (1 - 0.027)).toFixed(priceDecimalPlaces),
          slOrdPx: "-1", //market order
        }
      );

      await sleep(200);
      const details = await okxClient.getOrderDetails(object.clOrdId, symbol);

      await mongo.writeTransaction(symbol, exchange, {
        ...object,
        type: "Long Entry",
        price: +details.avgPx,
        invest: +details.avgPx * +details.accFillSz,
        netInvest: (+details.avgPx * +details.accFillSz) / leverage,
        holdDuration: 0,
        fee: Math.abs(+details.fee),
      });
      resetStorage();
    }
  }

  if (hasOpenPosition) {
    logger.info({
      netProfitInPercent,
      holdDuration,
    });
    //matches, even more accurate by a few decimal places and includes fees
    //const calculated = await calculateProfit(exchange, lastTrade!, price);
    const longExit = storage.long_exit >= strategy.long_exit.length;
    //const shortExit = storage.short_exit >= strategy.short_exit.length;
    if (longExit) {
      await okxClient.closePosition(symbol, object.clOrdId);
      await sleep(200);

      const details = await okxClient.getOrderDetails(object.clOrdId, symbol);
      const pnl = +details.avgPx * +details.accFillSz - lastTrade!.invest;
      const profit = pnl / lastTrade!.invest;
      const fee = Math.abs(+details.fee);
      const netProfit = profit - fee / lastTrade!.invest;

      const calcProfit = await calculateProfit("okx", lastTrade!, price);

      await mongo.writeTransaction(symbol, exchange, {
        ...object,
        type: "Long Exit",
        price: +details.avgPx,
        invest: +details.avgPx * +details.accFillSz,
        netInvest: (+details.avgPx * +details.accFillSz) / leverage,
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
      });
    }
  }
}

async function main() {
  logger.info(`Starting trader for ${symbol} on ${exchange}`);
  for (let i = 0; i < 8_000; i++) {
    const timestamp = subMinutes(new Date(), 8_000 - i);
    logger.debug(`Time: ${timestamp.toLocaleString()}`);
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
  const positions = await okxClient.getPositions(symbol);
  const openPositions = positions.filter((position) => position.upl !== "");
  if (openPositions.length > 0) {
    throw new Error(`There is already a position open`);
  }

  //set leverage
  await okxClient.setLeverage(symbol, leverage);

  okxClient.subscribeToPriceData(symbol);
  okxClient.subscribeToPositionData(symbol);

  const instruments = await okxClient.getInstruments();
  const instrument = instruments.find((i) => i.instId === symbol);
  if (!instrument) throw new Error("No instrument found");
  minSize = +instrument.minSz;
  lotSize = +instrument.lotSz;
  tickSize = instrument.tickSz;

  while (true) {
    trader();
    await sleep(1000 * 10);
  }
}

main();
