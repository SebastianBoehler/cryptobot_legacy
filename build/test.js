"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const date_fns_1 = require("date-fns");
const generateIndicators_1 = require("./generateIndicators");
const mongodb_1 = __importDefault(require("./mongodb"));
const utils_1 = require("./mongodb/utils");
const utils_2 = require("./utils");
const myMongo = new mongodb_1.default("dydx");
const exchange = "coinbase";
const symbol = "BTC-EUR";
async function test() {
    const indicatorGen = new generateIndicators_1.generateIndicators(exchange, symbol, 60);
    const result = await myMongo.getStartAndEndDates(exchange, symbol, (0, utils_1.getTimeKey)(exchange));
    if (!result)
        return;
    const { end } = result;
    const start = (0, date_fns_1.subHours)(end, 24 * 7);
    for (let i = 100; i < Infinity; i++) {
        const timestamp = (0, date_fns_1.addMinutes)(start, i);
        if (timestamp.getTime() > end.getTime()) {
            utils_2.logger.info(`End of data reached`);
            break;
        }
        const indicators = await indicatorGen.getIndicators(timestamp.getTime());
        utils_2.logger.info(`Time: ${timestamp.toLocaleString()}`);
        utils_2.logger.info(indicators);
    }
}
test();
//# sourceMappingURL=test.js.map