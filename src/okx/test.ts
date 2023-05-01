import {
  calculateProfit,
  createUniqueId,
  logger,
  sleep,
  toDecimals,
} from "../utils";
import { OkxClient } from "./utils";

const okxClient = new OkxClient();

const symbol = "COMP-USDT-SWAP";
okxClient.subscribeToPriceData(symbol);
okxClient.subscribeToPositionData(symbol);
okxClient.subsribeToOderData(symbol);

async function test() {
  await sleep(1000 * 10);
  const startBalance = await okxClient.getAccountBalance();
  const totalEqStart = startBalance[0].totalEq;
  logger.info("Start Balance: ", totalEqStart);
  //logger.info(await okxClient.getTickers());

  //const instruments = await okxClient.getInstruments();
  //const instrument = instruments.find((i) => i.instId === symbol);
  //logger.info(instrument);

  const id = createUniqueId(32);
  await okxClient
    .placeIOCOrder(
      symbol,
      "buy",
      toDecimals((50 * 5) / +okxClient.lastTicker!.last, 0), //COMP
      id,
      "42",
      {
        tpTriggerPx: "44", // to be safe
        tpOrdPx: "-1", //market order
      },
      {
        slTriggerPx: "39", // to be safe
        slOrdPx: "-1", //market order
      }
    )
    .catch((err) => {
      logger.error(err);
    });

  await sleep(1000 * 5);
  const details = await okxClient.getOrderDetails(id, symbol);
  logger.debug(JSON.stringify(details, null, 2));

  if (+totalEqStart < 10_000) return;
  const entryId = createUniqueId(32);

  //entry order
  await okxClient.placeMarketOrder(symbol, "buy", 1, entryId);

  const entryDetails = await okxClient.getOrderDetails(entryId, symbol);
  const entryPrice = entryDetails.avgPx;
  const entryFee = entryDetails.fee;

  logger.info("OrderId", entryId);
  logger.info("Entry Price: ", entryPrice);

  const interval = setInterval(async () => {
    logger.debug("profit", okxClient.pnl?.usd);
  }, 1000 * 5);

  await sleep(1000 * 30);
  clearInterval(interval);

  //exit order
  const exitId = createUniqueId(32);
  await okxClient.closePosition(symbol, exitId);

  const exitDetails = await okxClient.getOrderDetails(exitId, symbol);
  const exitPrice = exitDetails.avgPx;
  const exitFee = exitDetails.fee;

  logger.info({
    entryPrice,
    exitPrice,
  });

  await sleep(1000 * 5);

  const endBalance = await okxClient.getAccountBalance();
  const totalEqEnd = endBalance[0].totalEq;
  const feeSum = +entryFee + +exitFee;

  logger.info({
    entryFee,
    exitFee,
  });

  logger.info({
    startBalance: totalEqStart,
    endBalance: totalEqEnd,
    feeSum,
    profit: +totalEqEnd - +totalEqStart,
  });

  const calculatedProfit = await calculateProfit(
    "okx",
    {
      type: "Long Entry",
      price: +entryPrice,
      invest: 1 * +entryPrice,
      netInvest: 1 * +entryPrice - +entryFee,
      fee: +entryFee,
    },
    +exitPrice
  );

  logger.info({
    netProfit: calculatedProfit.netProfit,
    netProfitInPercent: calculatedProfit.netProfitInPercent,
    priceChangePercent: calculatedProfit.priceChangePercent,
    fee: calculatedProfit.fee,
  });
}

test();
