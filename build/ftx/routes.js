"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
const utils_1 = require("./utils");
const generateIndicators_1 = require("../generateIndicators");
const mysql_1 = __importDefault(require("../mysql"));
const sqlClientStorage = new mysql_1.default('storage');
const ftxStorage = new mysql_1.default('ftx');
router.get('/ping', (req, res) => {
    res.send('pong');
});
router.get('/overview', async (req, res) => {
    const markets = await (0, utils_1.getMarkets)();
    const futures = markets.filter(item => item['futureType'] === 'perpetual' && item['enabled']);
    const sorted = futures.sort((a, b) => b['volumeUsd24h'] - a['volumeUsd24h']).slice(0, 8);
    const obj = {};
    for (const market of sorted) {
        try {
            const symbol = market.name;
            console.log(symbol);
            const [indicators25min, indicators60min] = await Promise.all([
                (0, generateIndicators_1.generateIndicators)(symbol, 25, new Date().getTime()),
                (0, generateIndicators_1.generateIndicators)(symbol, 60, new Date().getTime())
            ]);
            if (!indicators25min || !indicators60min)
                continue;
            console.log(indicators25min);
            obj[symbol] = {
                long: {
                    main: [
                        {
                            key: '60m MACD histogram',
                            val: indicators60min['MACD']['histogram'] > 0
                        }
                    ],
                    optional: [
                        {
                            key: '60m RSI',
                            val: indicators60min['RSI'] > 50
                        }
                    ]
                },
            };
        }
        catch (error) {
            continue;
        }
    }
    res.setHeader('Cache-Control', `s-maxage=${86400}`);
    res.send(obj);
});
router.get('/transactions', async (req, res) => {
    //url params
    const limit = +req.query.limit;
    const id = +req.query.id;
    const transactions = await sqlClientStorage.loadTransactions('backtester', limit, id);
    res.setHeader('Cache-Control', `s-maxage=${86400}`);
    res.send(transactions);
});
router.post('/priceHistory', async (req, res) => {
    if (!req.body)
        return res.status(400).send('No body');
    const { symbol, time } = req.body;
    const string = ` WHERE time > ${time}`;
    const history = await ftxStorage.getPriceHistory(symbol, string, undefined, 'close, time');
    res.send(history);
});
exports.default = router;
//# sourceMappingURL=routes.js.map