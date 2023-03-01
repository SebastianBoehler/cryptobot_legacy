"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeKey = void 0;
class Binance {
    baseURL = "https://api.binance.com/api/v3";
    apiKey;
    apiSecret;
    constructor(key, secret) {
        this.apiKey = key;
        this.apiSecret = secret;
    }
    async exchangeInfo(permissions) {
        const resp = await fetch(`${this.baseURL}/exchangeInfo${permissions ? `?permissions=${permissions.toString()}` : ""}`, {
            method: "GET",
        });
        const data = await resp.json();
        return data;
    }
}
exports.default = Binance;
exports.timeKey = "openTime";
//# sourceMappingURL=utils.js.map