"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const date_fns_1 = require("date-fns");
class Kraken {
    constructor() { }
    async getTradablePairs() {
        const url = "https://api.kraken.com/0/public/AssetPairs";
        const response = await fetch(url);
        const json = await response.json();
        return json.result;
    }
    async getOHLCdata(symbol, interval = 1, since) {
        const url = `https://api.kraken.com/0/public/OHLC?pair=${symbol}&interval=${interval}&since=${(0, date_fns_1.getUnixTime)(since)}`;
        const response = await fetch(url);
        const json = await response.json();
        //remove last element
        json.result[symbol].sort((a, b) => a[0] - b[0]);
        json.result[symbol].pop();
        return json.result[symbol];
    }
}
exports.default = Kraken;
//# sourceMappingURL=utils.js.map