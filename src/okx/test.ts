import { calculateProfit, createUniqueId, logger, sleep } from "../utils";
import { OkxClient } from "./utils";

const okxClient = new OkxClient();

const symbol = "LTC-USDT-SWAP";
//okxClient.subscribeToPriceData(symbol);
okxClient.subscribeToPositionData(symbol);
okxClient.subsribeToOderData(symbol);

async function test() {
  await sleep(1000 * 5);
  const startBalance = await okxClient.getAccountBalance();
  const totalEqStart = startBalance[0].totalEq;
  logger.info("Start Balance: ", totalEqStart);
  logger.info(await okxClient.getTickers());
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
