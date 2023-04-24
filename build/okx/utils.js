"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OkxClient = void 0;
const okx_api_1 = require("okx-api");
const utils_1 = require("../utils");
const types_1 = require("./types");
const date_fns_1 = require("date-fns");
const credentials = {
    apiKey: "42975a9f-9662-48fa-be91-4bd552244c84",
    apiSecret: "1B4A1C25855CD1754828CD72776D0357",
    apiPass: "Okx+27102001",
};
class OkxClient {
    wsClient;
    restClient;
    lastTicker = null;
    subscriptions = [];
    pnl = null;
    candel1m = [];
    constructor() {
        this.restClient = new okx_api_1.RestClient(credentials);
        this.wsClient = new okx_api_1.WebsocketClient({
            accounts: [credentials],
        }, {
            ...okx_api_1.DefaultLogger,
            ...utils_1.logger,
        });
        this.wsClient.on("update", this.onUpdate.bind(this));
        this.wsClient.on("response", this.onResponse.bind(this));
        this.wsClient.on("error", (error) => {
            utils_1.logger.error("[OKX]", error);
        });
    }
    async onUpdate(event) {
        if ((0, types_1.isTickerUpdateEvent)(event)) {
            this.lastTicker = event.data[0];
            const lastCandle = this.candel1m[this.candel1m.length - 1];
            if (!lastCandle) {
                const start = (0, date_fns_1.subMinutes)(new Date(), 1);
                start.setSeconds(0, 0);
                this.candel1m.push({
                    close: this.lastTicker.last,
                    start,
                });
            }
            if (lastCandle) {
                const start = (0, date_fns_1.subMinutes)(new Date(), 1);
                start.setSeconds(0, 0);
                const diff = (0, date_fns_1.differenceInMinutes)(start, lastCandle.start);
                if (diff < 1)
                    return;
                this.candel1m.push({
                    close: this.lastTicker.last,
                    start,
                });
                //keep max 10 candles
                if (this.candel1m.length > 10)
                    this.candel1m.shift();
            }
        }
        else if ((0, types_1.isPositionUpdateEvent)(event)) {
            //TODO: check if emitted when pos manually updated
            if (event.data.length > 0) {
                this.pnl = {
                    usd: event.data[0].upl,
                    profit: event.data[0].uplRatio,
                };
            }
        }
        else if ((0, types_1.isOrderUpdateEvent)(event)) {
            // order placed / filled / cancelled
            const data = event.data[0];
            utils_1.logger.debug("[OKX] order update", data.state, data.clOrdId, data.ordId);
        }
        else {
            utils_1.logger.info("[OKX] unhandled event", event);
        }
    }
    //subscribe / unsubscribe events
    async onResponse({ event, arg }) {
        if (event === "unsubscribe") {
            utils_1.logger.debug("[OKX] Unsubscribed", arg);
            this.lastTicker = null;
            this.subscriptions = this.subscriptions.filter((sub) => sub.instId !== arg.instId && sub.channel !== arg.channel);
        }
        if (event === "subscribe") {
            utils_1.logger.debug("[OKX] Subscribed", arg);
            this.subscriptions.push(arg);
        }
    }
    async subscribeToPriceData(symbol) {
        this.wsClient.subscribe({
            channel: "tickers",
            instId: symbol,
        });
    }
    async unsubscribeFromPriceData(symbol) {
        this.wsClient.unsubscribe({
            channel: "tickers",
            instId: symbol,
        });
    }
    async subscribeToPositionData(symbol, instType = "SWAP") {
        this.wsClient.subscribe({
            channel: "positions",
            instType,
            instId: symbol,
        });
    }
    async subsribeToOderData(symbol, instType = "SWAP") {
        this.wsClient.subscribe({
            channel: "orders",
            instType,
            instId: symbol,
        });
    }
    async getAccountBalance() {
        const resp = await this.restClient.getBalance();
        return resp;
    }
    async placeMarketOrder(symbol, side, size, clOrdId = (0, utils_1.createUniqueId)(32), takeProfit, stopLoss) {
        const resp = await this.restClient.submitOrder({
            clOrdId,
            instId: symbol,
            ordType: "market",
            side,
            sz: String(size),
            tdMode: "isolated",
            ...takeProfit,
            ...stopLoss,
        });
        return {
            ...resp[0],
            clOrdId,
        };
    }
    /**
     * Immediate or cancel order, takes the best price available
     */
    async placeIOCOrder(symbol, side, size, clOrdId = (0, utils_1.createUniqueId)(32), price, takeProfit, stopLoss) {
        if (!price)
            throw new Error("No price data available");
        const resp = await this.restClient.submitOrder({
            clOrdId,
            instId: symbol,
            px: price,
            ordType: "ioc",
            side,
            sz: String(size),
            tdMode: "isolated",
            ...takeProfit,
            ...stopLoss,
        });
        return {
            ...resp[0],
            clOrdId,
        };
    }
    async getPositions(instId, posId, instType) {
        const resp = await this.restClient.getPositions({
            instId,
            posId,
            instType,
        });
        return resp;
    }
    async closePosition(symbol, clOrdId = (0, utils_1.createUniqueId)(32)) {
        const resp = await this.restClient.closePositions({
            clOrdId,
            instId: symbol,
            mgnMode: "isolated",
            autoCxl: true,
        });
        return resp;
    }
    async getOrderDetails(clOrdId, symbol) {
        const resp = await this.restClient.getOrderDetails({
            instId: symbol,
            clOrdId,
        });
        return resp[0];
    }
    async getOrderList(instType, instId) {
        const resp = await this.restClient.getOrderList({
            instType,
            instId,
        });
        return resp;
    }
    async amendOrder(clOrdId, instId, newPx) {
        const resp = await this.restClient.amendOrder({
            instId,
            clOrdId,
            newPx: String(newPx),
        });
        return resp;
    }
    async setLeverage(symbol, leverage, mgnMode = "isolated") {
        utils_1.logger.warn(`Setting leverage to ${leverage} for ${symbol}`);
        const resp = await this.restClient.setLeverage({
            instId: symbol,
            mgnMode,
            lever: String(leverage),
        });
        return resp;
    }
    async getTickers(instType = "SWAP") {
        const resp = await this.restClient.getTickers(instType);
        return resp;
    }
    async getInstruments(instType = "SWAP") {
        const resp = await this.restClient.getInstruments(instType);
        return resp;
    }
}
exports.OkxClient = OkxClient;
//# sourceMappingURL=utils.js.map