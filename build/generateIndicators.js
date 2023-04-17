"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateIndicators = void 0;
const indicators_1 = require("@debut/indicators");
const date_fns_1 = require("date-fns");
const mongodb_1 = __importDefault(require("./mongodb"));
class generateIndicators {
    //private length: number = 20;
    exchange;
    symbol;
    mongodb;
    indicators = {
        ema_8: new indicators_1.EMA(8),
        ema_13: new indicators_1.EMA(13),
        ema_21: new indicators_1.EMA(21),
        ema_55: new indicators_1.EMA(55),
        bollinger_bands: new indicators_1.BollingerBands(),
        MACD: new indicators_1.MACD(),
        RSI: new indicators_1.RSI(),
        ADX: new indicators_1.ADX(),
    };
    granularity;
    lastValues = {
        ema_8: 0,
        ema_13: 0,
        ema_21: 0,
        ema_55: 0,
        bollinger_bands: {
            upper: 0,
            middle: 0,
            lower: 0,
        },
        MACD: {
            macd: 0,
            emaFast: 0,
            emaSlow: 0,
            signal: 0,
            histogram: 0,
        },
        vol: 0,
        RSI: 0,
        ADX: { adx: 0, pdi: 0, mdi: 0 },
    };
    prevValues = null;
    lastTimestamp = null;
    constructor(exchange, symbol, granularity) {
        this.exchange = exchange;
        this.symbol = symbol;
        this.stopRepainting = this.stopRepainting.bind(this);
        this.mongodb = new mongodb_1.default(exchange);
        this.granularity = granularity;
    }
    async getIndicators(timestamp) {
        let adjustedTimestamp = new Date(timestamp);
        const stopRepainting = await this.stopRepainting(timestamp, this.granularity);
        if (stopRepainting < 1 &&
            this.lastTimestamp !== (0, date_fns_1.format)(timestamp, "yyyy-MM-dd HH:mm")) {
            this.lastTimestamp = (0, date_fns_1.format)(timestamp, "yyyy-MM-dd HH:mm");
            adjustedTimestamp = (0, date_fns_1.subMinutes)(adjustedTimestamp.getTime(), stopRepainting);
            adjustedTimestamp.setSeconds(0);
            //logger.debug("[indicators] loading new candle");
            //logger.info(`Repainting ${stopRepainting} minutes`);
            //logger.info(`Old timestamp: ${new Date(timestamp).toLocaleString()}`);
            //logger.info(`New timestamp: ${adjustedTimestamp.toLocaleString()}`);
            const candle = await this.mongodb.generateCandle(this.granularity, timestamp, this.symbol);
            if (!candle) {
                return this.lastValues;
            }
            const { close, high, low } = candle;
            const obj = {
                ema_8: this.indicators.ema_8.nextValue(close),
                ema_13: this.indicators.ema_13.nextValue(close),
                ema_21: this.indicators.ema_21.nextValue(close),
                ema_55: this.indicators.ema_55.nextValue(close),
                bollinger_bands: this.indicators.bollinger_bands.nextValue(close),
                MACD: this.indicators.MACD.nextValue(close),
                vol: candle.volume,
                RSI: this.indicators.RSI.nextValue(close),
                ADX: this.indicators.ADX.nextValue(high, low, close),
            };
            if (!obj.bollinger_bands || !obj.MACD) {
                return this.lastValues;
            }
            if (this.lastValues.ema_8 !== 0) {
                this.prevValues = this.lastValues;
            }
            this.lastValues = obj;
            return this.lastValues;
        }
        /*logger.debug("Candle:", {
          ...this.candles[this.candles.length - 1],
          time: new Date(timestamp).toLocaleString(),
        });*/
        return this.lastValues;
    }
    async stopRepainting(timestamp, granularity) {
        let mins = Math.trunc(timestamp / 1000 / 60);
        if (mins % granularity == 0) {
            return 0;
        }
        else {
            for (var b = 1; b <= granularity; b++) {
                if ((mins - b) % granularity == 0) {
                    return b;
                }
            }
        }
        return 0;
    }
}
exports.generateIndicators = generateIndicators;
//# sourceMappingURL=generateIndicators.js.map