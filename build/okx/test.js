"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("../utils");
const utils_2 = require("./utils");
const okxClient = new utils_2.OkxClient();
const symbol = "LTC-USDT-SWAP";
//okxClient.subscribeToPriceData(symbol);
okxClient.subscribeToPositionData(symbol);
okxClient.subsribeToOderData(symbol);
async function test() {
    await (0, utils_1.sleep)(1000 * 5);
    const startBalance = await okxClient.getAccountBalance();
    const totalEqStart = startBalance[0].totalEq;
    utils_1.logger.info("Start Balance: ", totalEqStart);
    utils_1.logger.info(await okxClient.getTickers());
    if (+totalEqStart < 10_000)
        return;
    const entryId = (0, utils_1.createUniqueId)(32);
    //entry order
    await okxClient.placeMarketOrder(symbol, "buy", 1, entryId);
    const entryDetails = await okxClient.getOrderDetails(entryId, symbol);
    const entryPrice = entryDetails.avgPx;
    const entryFee = entryDetails.fee;
    utils_1.logger.info("OrderId", entryId);
    utils_1.logger.info("Entry Price: ", entryPrice);
    const interval = setInterval(async () => {
        utils_1.logger.debug("profit", okxClient.pnl?.usd);
    }, 1000 * 5);
    await (0, utils_1.sleep)(1000 * 30);
    clearInterval(interval);
    //exit order
    const exitId = (0, utils_1.createUniqueId)(32);
    await okxClient.closePosition(symbol, exitId);
    const exitDetails = await okxClient.getOrderDetails(exitId, symbol);
    const exitPrice = exitDetails.avgPx;
    const exitFee = exitDetails.fee;
    utils_1.logger.info({
        entryPrice,
        exitPrice,
    });
    await (0, utils_1.sleep)(1000 * 5);
    const endBalance = await okxClient.getAccountBalance();
    const totalEqEnd = endBalance[0].totalEq;
    const feeSum = +entryFee + +exitFee;
    utils_1.logger.info({
        entryFee,
        exitFee,
    });
    utils_1.logger.info({
        startBalance: totalEqStart,
        endBalance: totalEqEnd,
        feeSum,
        profit: +totalEqEnd - +totalEqStart,
    });
    const calculatedProfit = await (0, utils_1.calculateProfit)("okx", {
        type: "Long Entry",
        price: +entryPrice,
        invest: 1 * +entryPrice,
        netInvest: 1 * +entryPrice - +entryFee,
        fee: +entryFee,
    }, +exitPrice);
    utils_1.logger.info({
        netProfit: calculatedProfit.netProfit,
        netProfitInPercent: calculatedProfit.netProfitInPercent,
        priceChangePercent: calculatedProfit.priceChangePercent,
        fee: calculatedProfit.fee,
    });
}
test();
//# sourceMappingURL=test.js.map