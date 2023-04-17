import { EMA, BollingerBands, MACD, RSI, ADX } from "@debut/indicators";
import { format, subMinutes } from "date-fns";
import mongodb from "./mongodb";
import { Indicators } from "./types/trading";

class generateIndicators {
  //private length: number = 20;
  public exchange: string;
  public symbol: string;
  private mongodb: mongodb;
  private indicators = {
    ema_8: new EMA(8),
    ema_13: new EMA(13),
    ema_21: new EMA(21),
    ema_55: new EMA(55),
    bollinger_bands: new BollingerBands(),
    MACD: new MACD(),
    RSI: new RSI(),
    ADX: new ADX(),
  };
  private granularity: number;
  public lastValues: Indicators = {
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
  public prevValues: Indicators | null = null;
  private lastTimestamp: string | null = null;

  constructor(exchange: string, symbol: string, granularity: number) {
    this.exchange = exchange;
    this.symbol = symbol;
    this.stopRepainting = this.stopRepainting.bind(this);
    this.mongodb = new mongodb(exchange);
    this.granularity = granularity;
  }

  async getIndicators(timestamp: number) {
    let adjustedTimestamp = new Date(timestamp);
    const stopRepainting = await this.stopRepainting(
      timestamp,
      this.granularity
    );
    if (
      stopRepainting < 1 &&
      this.lastTimestamp !== format(timestamp, "yyyy-MM-dd HH:mm")
    ) {
      this.lastTimestamp = format(timestamp, "yyyy-MM-dd HH:mm");
      adjustedTimestamp = subMinutes(
        adjustedTimestamp.getTime(),
        stopRepainting
      );
      adjustedTimestamp.setSeconds(0);

      //logger.debug("[indicators] loading new candle");
      //logger.info(`Repainting ${stopRepainting} minutes`);
      //logger.info(`Old timestamp: ${new Date(timestamp).toLocaleString()}`);
      //logger.info(`New timestamp: ${adjustedTimestamp.toLocaleString()}`);
      const candle = await this.mongodb.generateCandle(
        this.granularity,
        timestamp,
        this.symbol
      );

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

  async stopRepainting(timestamp: number, granularity: number) {
    let mins = Math.trunc(timestamp / 1000 / 60);
    if (mins % granularity == 0) {
      return 0;
    } else {
      for (var b = 1; b <= granularity; b++) {
        if ((mins - b) % granularity == 0) {
          return b;
        }
      }
    }
    return 0;
  }
}

export { generateIndicators };
