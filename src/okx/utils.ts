import {
  DefaultLogger,
  WebsocketClient,
  WsDataEvent,
  WsEvent,
  RestClient,
  InstrumentType,
} from "okx-api";
import { createUniqueId, logger } from "../utils";
import {
  TickerUpdateData,
  TickerUpdateEvent,
  isOrderUpdateEvent,
  isPositionUpdateEvent,
  isTickerUpdateEvent,
} from "./types";
import { differenceInMinutes, subMinutes } from "date-fns";

const credentials = {
  apiKey: "42975a9f-9662-48fa-be91-4bd552244c84",
  apiSecret: "1B4A1C25855CD1754828CD72776D0357",
  apiPass: "Okx+27102001",
};

class OkxClient {
  private wsClient: WebsocketClient;
  private restClient: RestClient;
  public lastTicker: TickerUpdateData | null = null;
  public subscriptions: { channel: string; instId: string }[] = [];
  public pnl: {
    usd: string;
    profit: string;
    tradeId: string;
    liqPrice: number;
  } | null = null;
  public candel1m: { close: string; start: Date }[] = [];

  constructor() {
    this.restClient = new RestClient(credentials);

    this.wsClient = new WebsocketClient(
      {
        accounts: [credentials],
        //pingInterval: 1000 * 10,
      },
      {
        ...DefaultLogger,
        ...logger,
      }
    );

    this.wsClient.on("update", this.onUpdate.bind(this));
    this.wsClient.on("response", this.onResponse.bind(this));
    this.wsClient.on("error", (error) => {
      logger.error("[OKX]", error);
    });
  }

  async onUpdate(event: TickerUpdateEvent | WsDataEvent) {
    if (isTickerUpdateEvent(event)) {
      this.lastTicker = event.data[0];

      const lastCandle = this.candel1m[this.candel1m.length - 1];
      if (!lastCandle) {
        const start = subMinutes(new Date(), 1);
        start.setSeconds(0, 0);
        this.candel1m.push({
          close: this.lastTicker.last,
          start,
        });
      }
      if (lastCandle) {
        const start = subMinutes(new Date(), 1);
        start.setSeconds(0, 0);
        const diff = differenceInMinutes(start, lastCandle.start);
        if (diff < 1) return;
        this.candel1m.push({
          close: this.lastTicker.last,
          start,
        });

        //keep max 10 candles
        if (this.candel1m.length > 10) this.candel1m.shift();
      }
    } else if (isPositionUpdateEvent(event)) {
      //TODO: check if emitted when pos manually updated
      //no extra event, values just set to ""
      if (event.data.length > 0) {
        this.pnl = {
          usd: event.data[0].upl,
          profit: event.data[0].uplRatio,
          tradeId: event.data[0].tradeId,
          liqPrice: +event.data[0].liqPx,
        };
      }
      //logger.debug(JSON.stringify(event, null, 2));
    } else if (isOrderUpdateEvent(event)) {
      // order placed / filled / cancelled
      const data = event.data[0];
      logger.debug("[OKX] order update", data.state, data.clOrdId, data.ordId);
    } else {
      logger.info("[OKX] unhandled event", event);
    }
  }

  //subscribe / unsubscribe events
  async onResponse({ event, arg }: WsEvent) {
    if (event === "unsubscribe") {
      logger.debug("[OKX] Unsubscribed", arg);
      this.lastTicker = null;
      this.subscriptions = this.subscriptions.filter(
        (sub) => sub.instId !== arg.instId && sub.channel !== arg.channel
      );
    }
    if (event === "subscribe") {
      logger.debug("[OKX] Subscribed", arg);
      this.subscriptions.push(arg);
    }
  }

  async subscribeToPriceData(symbol: string) {
    this.wsClient.subscribe({
      channel: "tickers",
      instId: symbol,
    });
  }

  async unsubscribeFromPriceData(symbol: string) {
    this.wsClient.unsubscribe({
      channel: "tickers",
      instId: symbol,
    });
  }

  async subscribeToPositionData(
    symbol: string,
    instType: InstrumentType = "SWAP"
  ) {
    this.wsClient.subscribe({
      channel: "positions",
      instType,
      instId: symbol,
    });
  }

  async subsribeToOderData(symbol: string, instType: InstrumentType = "SWAP") {
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

  async placeMarketOrder(
    symbol: string,
    side: "buy" | "sell",
    size: number | string,
    clOrdId: string = createUniqueId(32),
    takeProfit?: {
      tpTriggerPx: string;
      tpOrdPx: string;
    },
    stopLoss?: {
      slTriggerPx: string;
      slOrdPx: string;
    }
  ) {
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
  async placeIOCOrder(
    symbol: string,
    side: "buy" | "sell",
    size: number | string,
    clOrdId: string = createUniqueId(32),
    price: string,
    takeProfit?: {
      tpTriggerPx: string;
      tpOrdPx: string;
    },
    stopLoss?: {
      slTriggerPx: string;
      slOrdPx: string;
    }
  ) {
    if (!price) throw new Error("No price data available");
    const resp = await this.restClient.submitOrder({
      clOrdId,
      instId: symbol,
      px: price,
      ordType: "ioc", //immediate or cancel
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

  async getPositions(
    instId?: string,
    posId?: string,
    instType?: InstrumentType
  ) {
    const resp = await this.restClient.getPositions({
      instId,
      posId,
      instType,
    });
    return resp;
  }

  async closePosition(symbol: string, clOrdId: string = createUniqueId(32)) {
    const resp = await this.restClient.closePositions({
      clOrdId,
      instId: symbol,
      mgnMode: "isolated",
      autoCxl: true,
    });
    return resp;
  }

  async getOrderDetails(clOrdId: string, symbol: string) {
    const resp = await this.restClient.getOrderDetails({
      instId: symbol,
      clOrdId,
    });
    return resp[0];
  }

  async getOrderList(instType: InstrumentType, instId?: string) {
    const resp = await this.restClient.getOrderList({
      instType,
      instId,
    });
    return resp;
  }

  async amendOrder(clOrdId: string, instId: string, newPx: number) {
    const resp = await this.restClient.amendOrder({
      instId,
      clOrdId,
      newPx: String(newPx),
    });
    return resp;
  }

  async setLeverage(
    symbol: string,
    leverage: number,
    mgnMode: "cross" | "isolated" = "isolated"
  ) {
    logger.warn(`Setting leverage to ${leverage} for ${symbol}`);
    const resp = await this.restClient.setLeverage({
      instId: symbol,
      mgnMode,
      lever: String(leverage),
    });
    return resp;
  }

  async getTickers(instType: InstrumentType = "SWAP") {
    const resp = await this.restClient.getTickers(instType);
    return resp;
  }

  async getInstruments(instType: InstrumentType = "SWAP") {
    const resp = await this.restClient.getInstruments(instType);
    return resp;
  }
}

export { OkxClient };
