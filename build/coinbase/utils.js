"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeKey = exports.CoinbaseAdvanced = void 0;
const crypto_1 = __importDefault(require("crypto"));
class CoinbaseAdvanced {
    key;
    baseURL = "https://api.coinbase.com/api/v3";
    constructor(key) {
        this.key = key;
    }
    createSignature(data) {
        const secret = "WlXvIjcHa6yqenEfJfVRYTsLbmGKdgog";
        return crypto_1.default.createHmac("sha256", secret).update(data).digest("hex");
    }
    createHeaders(timestamp, method, path, body) {
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
            headers: this.createHeaders(Math.floor(Date.now() / 1000), "GET", "/api/v3/brokerage/products", ""),
        });
        this.handleStatusCode(resp);
        const data = await resp.json();
        return data.products;
    }
    async getKlines({ symbol, interval, startTime, endTime, }) {
        const resp = await fetch(`${this.baseURL}/brokerage/products/${symbol}/candles?granularity=${interval}&start=${startTime}&end=${endTime}`, {
            method: "GET",
            headers: this.createHeaders(Math.floor(Date.now() / 1000), "GET", `/api/v3/brokerage/products/${symbol}/candles`, ""),
        });
        this.handleStatusCode(resp);
        const data = await resp.json();
        return data.candles;
    }
    handleStatusCode(resp) {
        if (resp.status === 401) {
            throw new Error(`Unauthorized! Invalid API key: ${this.key}}`);
        }
        if (resp.status !== 200) {
            throw new Error(`Unexpected status code: ${resp.status}`);
        }
    }
}
exports.CoinbaseAdvanced = CoinbaseAdvanced;
exports.timeKey = "start";
//# sourceMappingURL=utils.js.map