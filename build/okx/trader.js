"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const date_fns_1 = require("date-fns");
const generateIndicators_1 = require("../generateIndicators");
const utils_1 = require("../utils");
const utils_2 = require("./utils");
const config_1 = __importDefault(require("../config/config"));
const mongodb_1 = __importDefault(require("../mongodb"));
process.on("unhandledRejection", (reason, p) => {
    utils_1.logger.error("Unhandled Rejection at: Promise", p, "reason:", reason);
});
//TODO: verify if netProfitInPercent * leverage is the correct trigger
//TODO: credentials into env
const mongo = new mongodb_1.default("trader");
const okxClient = new utils_2.OkxClient();
const exchange = "okx";
const symbol = "BAND-USDT-SWAP";
const startCapital = 50;
const leverage = config_1.default.LEVERAGE;
let minSize = 1;
let lotSize = 1;
let tickSize = "0.001"; //decimals of price
const indicators = {
    "25min": new generateIndicators_1.generateIndicators(exchange, symbol, 25),
    "60min": new generateIndicators_1.generateIndicators(exchange, symbol, 60),
    "2h": new generateIndicators_1.generateIndicators(exchange, symbol, 60 * 2),
};
let accountBalance;
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
async function placeEntry(netInvest, price, object, type) {
    const priceDecimalPlaces = tickSize.split(".")[1].length;
    const amount = (netInvest * leverage) / price;
    if (amount < minSize)
        throw new Error("Order size too small");
    utils_1.logger.debug(amount, netInvest * leverage, price, amount.toFixed(3));
    const side = type.includes("Long") ? "buy" : "sell";
    const tpChange = 0.06; //6%
    const slChange = 0.03; //3%
    const tpFactor = type.includes("Long") ? 1 + tpChange : 1 - tpChange; //5% price change profit
    const slFactor = type.includes("Long") ? 1 - slChange : 1 + slChange; //2.5% price change loss
    const size = (0, utils_1.toDecimals)(amount, lotSize);
    await okxClient.placeMarketOrder(symbol, side, size, object.clOrdId, 
    //places tp, sp a few percent above/below rule execution price to be safe
    {
        tpTriggerPx: String((0, utils_1.toDecimals)(price * tpFactor, priceDecimalPlaces)),
        tpOrdPx: "-1", //market order
    }, {
        slTriggerPx: String((0, utils_1.toDecimals)(price * slFactor, priceDecimalPlaces)),
        slOrdPx: "-1", //market order
    });
    await (0, utils_1.sleep)(200);
    const details = await okxClient.getOrderDetails(object.clOrdId, symbol);
    await mongo.writeTransaction(symbol, exchange, {
        ...object,
        price: +details.avgPx,
        invest: +details.avgPx * +details.accFillSz,
        netInvest: (+details.avgPx * +details.accFillSz) / leverage,
        holdDuration: 0,
        fee: Math.abs(+details.fee),
        type,
    });
    resetStorage();
}
async function trader() {
    if (!okxClient.lastTicker) {
        utils_1.logger.debug("No ticker data");
        return;
    }
    const lastTrade = await mongo.getLatestTransaction(symbol, exchange);
    const hasOpenPosition = lastTrade ? lastTrade.type.includes("Entry") : false;
    const holdDuration = lastTrade
        ? (0, date_fns_1.differenceInMinutes)(new Date(), lastTrade.timestamp)
        : 0;
    const [indicators_25min, indicators_60min, indicators_2h] = await Promise.all([
        indicators["25min"].getIndicators(new Date().getTime()),
        indicators["60min"].getIndicators(new Date().getTime()),
        indicators["2h"].getIndicators(new Date().getTime()),
    ]);
    const prev_indicators_60min = indicators["60min"].prevValues;
    const prev_indicators_2h = indicators["2h"].prevValues;
    const price = +okxClient.lastTicker.last;
    const spread = +okxClient.lastTicker.askPx / +okxClient.lastTicker.bidPx - 1; // always >0
    //fee not included here
    const netProfitInPercent = +(okxClient.pnl?.profit || 0) * 100;
    const exit = netProfitInPercent > 5 * leverage || netProfitInPercent < -2.5 * leverage;
    const strategy = {
        long_entry: [
            [false],
            [
                !!prev_indicators_60min &&
                    !!prev_indicators_2h &&
                    price > indicators_60min.bollinger_bands.lower &&
                    indicators_2h.MACD.histogram > prev_indicators_2h.MACD.histogram,
            ],
        ],
        long_exit: [[exit || holdDuration > 60 * 24]],
        short_entry: [
            [false],
            [
                !!prev_indicators_60min &&
                    !!prev_indicators_2h &&
                    price < indicators_60min.bollinger_bands.upper &&
                    indicators_2h.MACD.histogram < prev_indicators_2h.MACD.histogram,
            ],
        ],
        short_exit: [[exit || holdDuration > 60 * 24]],
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
        clOrdId: (0, utils_1.createUniqueId)(32),
        details: {
            indicators_25min,
            indicators_60min,
            indicators_2h,
        },
        spread,
    };
    if (!hasOpenPosition) {
        const longEntry = storage.long_entry >= strategy.long_entry.length;
        const shortEntry = storage.short_entry >= strategy.short_entry.length;
        utils_1.logger.info(`Waiting for entry trigger: ${storage.long_entry} ${storage.short_entry}`);
        if (longEntry)
            placeEntry(netInvest, price, object, "Long Entry");
        if (shortEntry)
            placeEntry(netInvest, price, object, "Short Entry");
    }
    if (hasOpenPosition) {
        utils_1.logger.info({
            netProfitInPercent,
            holdDuration,
            priceChangePercent: (lastTrade.price / price - 1) * 100,
        });
        //matches, even more accurate by a few decimal places and includes fees
        //const calculated = await calculateProfit(exchange, lastTrade!, price);
        const longExit = storage.long_exit >= strategy.long_exit.length;
        const shortExit = storage.short_exit >= strategy.short_exit.length;
        if (longExit || shortExit) {
            await okxClient.closePosition(symbol, object.clOrdId);
            await (0, utils_1.sleep)(200);
            const details = await okxClient.getOrderDetails(object.clOrdId, symbol);
            const pnl = +details.avgPx * +details.accFillSz - lastTrade.invest;
            const profit = pnl / lastTrade.invest;
            const fee = Math.abs(+details.fee);
            const netProfit = profit - fee / lastTrade.invest;
            const calcProfit = await (0, utils_1.calculateProfit)("okx", lastTrade, price);
            const type = longExit ? "Long Exit" : "Short Exit";
            await mongo.writeTransaction(symbol, exchange, {
                ...object,
                type,
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
    utils_1.logger.info(`Starting trader for ${symbol} on ${exchange}`);
    for (let i = 0; i < 9_000; i++) {
        const timestamp = (0, date_fns_1.subMinutes)(new Date(), 9_000 - i);
        //logger.debug(`Time: ${timestamp.toLocaleString()}`);
        for (const [_key, indicator] of Object.entries(indicators)) {
            await indicator.getIndicators(timestamp.getTime());
        }
    }
    //get Account Balance
    const account = await okxClient.getAccountBalance();
    const USDT = account[0].details.find((detail) => detail.ccy === "USDT");
    if (!USDT)
        throw new Error("No USDT Balance found");
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
    if (!instrument)
        throw new Error("No instrument found");
    minSize = +instrument.minSz;
    lotSize = +instrument.lotSz;
    tickSize = instrument.tickSz;
    while (true) {
        trader();
        await (0, utils_1.sleep)(1000 * 10);
    }
}
main();
//# sourceMappingURL=trader.js.map