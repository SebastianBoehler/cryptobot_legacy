import crypto from "crypto";
import { TimeKey } from "../mongodb/utils";
import { ProductsResponse } from "./types";

class CoinbaseAdvanced {
  private key: string;
  private baseURL: string = "https://api.coinbase.com/api/v3";

  constructor(key: string) {
    this.key = key;
  }

  private createSignature(data: string) {
    const secret = "WlXvIjcHa6yqenEfJfVRYTsLbmGKdgog";
    return crypto.createHmac("sha256", secret).update(data).digest("hex");
  }

  private createHeaders(
    timestamp: number,
    method: string,
    path: string,
    body: string
  ) {
    return {
      accept: "application/json",
      "CB-ACCESS-KEY": this.key,
      "CB-ACCESS-SIGN": this.createSignature(timestamp + method + path + body),
      "CB-ACCESS-TIMESTAMP": timestamp.toString(),
    };
  }

  async listProducts() {
    const resp = await fetch(`${this.baseURL}/brokerage/products`, {
      method: "GET",
      headers: this.createHeaders(
        Math.floor(Date.now() / 1000),
        "GET",
        "/api/v3/brokerage/products",
        ""
      ),
    });

    this.handleStatusCode(resp);
    const data: ProductsResponse = await resp.json();

    return data.products;
  }

  async getKlines({
    symbol,
    interval,
    startTime,
    endTime,
  }: {
    symbol: string;
    interval: string;
    startTime: number;
    endTime: number;
  }) {
    const resp = await fetch(
      `${this.baseURL}/brokerage/products/${symbol}/candles?granularity=${interval}&start=${startTime}&end=${endTime}`,
      {
        method: "GET",
        headers: this.createHeaders(
          Math.floor(Date.now() / 1000),
          "GET",
          `/api/v3/brokerage/products/${symbol}/candles`,
          ""
        ),
      }
    );

    this.handleStatusCode(resp);
    const data: {
      candles: {
        start: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume: string;
      }[];
    } = await resp.json();

    return data.candles;
  }

  private handleStatusCode(resp: Response) {
    if (resp.status === 401) {
      throw new Error(`Unauthorized! Invalid API key: ${this.key}}`);
    }
    if (resp.status !== 200) {
      throw new Error(`Unexpected status code: ${resp.status}`);
    }
  }
}

export { CoinbaseAdvanced };
export const timeKey: TimeKey = "start";
