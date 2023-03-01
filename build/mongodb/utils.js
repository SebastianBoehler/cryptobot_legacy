"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimeKey = void 0;
const utils_1 = require("../binance/utils");
const utils_2 = require("../coinbase/utils");
const utils_3 = require("../dydx/utils");
function getTimeKey(database) {
    let _timeKey = "start";
    switch (database) {
        case "binance":
            _timeKey = utils_1.timeKey;
            break;
        case "coinbase":
            _timeKey = utils_2.timeKey;
            break;
        case "dydx":
            _timeKey = utils_3.timeKey;
            break;
    }
    return _timeKey;
}
exports.getTimeKey = getTimeKey;
//# sourceMappingURL=utils.js.map