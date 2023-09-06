import mongodb from "./mongodb";
import { Document } from "mongodb";
import { Candle, GeneratedCandle } from "./types/mongodb";
import { format, setMilliseconds, setSeconds, subMinutes } from "date-fns";
import {
  ADX,
  BollingerBands,
  EMA,
  HeikenAshi,
  Stochastic,
  ATR,
  MACD,
  RSI,
  CCI,
  ChaikinOscillator,
  ROC,
  PSAR,
  SMA,
} from "@debut/indicators";
import { Indicators } from "./types/trading";
import { OBV, VWAP } from "technicalindicators";
import { VWAPDeviation } from "./custom_indicators/vwap_deviation";

class GenerateIndicators {
  public exchange: string;
  public symbol: string;
  private mongodb: mongodb;
  private granularity: number;
  private candles: GeneratedCandle[] = [];
  private firstCall = true;

  //timestamp of when the last candle was added
  private lastTimestamp: string = "";

  public prevValues: Indicators | null = null;
  public lastValues: Indicators | null = null;

  private indicators = {
    ema_8: new EMA(8),
    ema_13: new EMA(13),
    ema_21: new EMA(21),
    ema_55: new EMA(55),
    bollinger_bands: new BollingerBands(15, 2),
    MACD: new MACD(),
    RSI: new RSI(14),
    stochRSI: new Stochastic(14, 14),
    ADX: new ADX(),
    ATR: new ATR(14, "EMA"),
    HA: new HeikenAshi(),
    CCI: new CCI(20),
    ChaikinOS: new ChaikinOscillator(3, 10),
    ROC: new ROC(14),
    PSAR: new PSAR(0.02, 0.2, 0.2),
    OBV: new OBV({ close: [], volume: [] }),
    OBV_RSI: new RSI(5),
    OBV_SMA: new SMA(5),
    VWAP: new VWAP({ close: [], high: [], low: [], volume: [] }),
    VWAP_deviation: new VWAPDeviation(false, "Average Deviation", 60),
  };

  constructor(exchange: string, symbol: string, granularity: number) {
    this.exchange = exchange;
    this.symbol = symbol;
    this.stopRepainting = this.stopRepainting.bind(this);
    this.mongodb = new mongodb(exchange);
    this.granularity = granularity;
  }

  async loadHistoricCandles() {
    const pipeline: Document[] = [
      {
        $group: {
          _id: {
            bucket: {
              $toDate: {
                $subtract: [
                  {
                    $toLong: "$start",
                  },
                  {
                    $mod: [
                      {
                        $subtract: [
                          { $toLong: "$start" },
                          {
                            $toLong: {
                              $dateFromString: {
                                dateString: "1970-01-01T00:00:00",
                                timezone: "UTC",
                              },
                            },
                          },
                        ],
                      },
                      1000 * 60 * this.granularity,
                    ],
                  },
                ],
              },
            },
          },
          start: { $first: "$start" },
          high: { $max: "$high" },
          low: { $min: "$low" },
          open: { $first: "$open" },
          close: { $last: "$close" },
          volume: {
            $sum: {
              $convert: {
                input: "$volume",
                to: "double",
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
        },
      },
      {
        $sort: {
          start: 1,
        },
      },
    ];
    const cursor = await this.mongodb.aggregate<GeneratedCandle>(
      pipeline,
      this.symbol
    );

    while (await cursor.hasNext()) {
      const candle = await cursor.next();
      if (candle) this.candles.push(candle);
    }
  }

  async getIndicators(timestamp: number) {
    const repaintNo = await this.stopRepainting(timestamp, this.granularity);
    let adjustedTimestamp = subMinutes(timestamp, repaintNo);
    //set seconds and ms to 0
    adjustedTimestamp = setSeconds(adjustedTimestamp, 0);
    adjustedTimestamp = setMilliseconds(adjustedTimestamp, 0);

    if (
      repaintNo < 1 &&
      this.lastTimestamp !== format(timestamp, "yyyy-MM-dd HH:mm") &&
      !this.firstCall
    ) {
      let candle: GeneratedCandle | Candle | undefined = this.candles.shift();
      if (!candle) {
        const result = await this.mongodb.generateCandle(
          this.granularity,
          adjustedTimestamp.getTime(),
          this.symbol
        );

        candle = result;
      }
      if (!candle) {
        throw new Error(
          `No candle found for ${this.symbol} at ${adjustedTimestamp}`
        );
      }

      const obj = await this.handleNewCandle(candle);

      this.lastTimestamp = format(timestamp, "yyyy-MM-dd HH:mm");
      this.prevValues = this.lastValues;
      this.lastValues = obj;
      return obj;
    }

    if (!this.firstCall && this.lastValues) return this.lastValues;

    const historicCandles: GeneratedCandle[] = this.candles.filter(
      (candle) => candle.start.getTime() < adjustedTimestamp.getTime()
    );

    //remove all historic candles from this.candles
    this.candles = this.candles.slice(historicCandles.length);

    const lastCandle = historicCandles.pop();
    if (!lastCandle) {
      throw new Error(
        "[generateIndicators] lastCandle is undefined, seems like candles couldnt be fetched"
      );
    }

    historicCandles.forEach((candle) => {
      this.handleNewCandle(candle);
    });

    const obj = await this.handleNewCandle(lastCandle);

    this.lastValues = obj;
    this.firstCall = false;
    return obj;
  }

  /**
   * Returns all indicators for the whole timeframe in an array of objects like {timestamp: number, indicators: Indicators}
   */
  async getIndicatorsForWholeTimeframe() {
    // we expect to have all candles in this.candles
    type Nullable<T> = { [P in keyof T]: T[P] | null };
    interface ExtendedData extends Indicators {
      candle: Candle;
    }
    interface NullableExtendedData extends Nullable<ExtendedData> {}
    const historicCandles = this.candles;

    const data = historicCandles.map((candle) => {
      const { high, low, close, open, volume, start } = candle;
      const ATR = this.indicators.ATR.nextValue(+high, +low, +close) || null;
      const onBalanceVol = this.indicators.OBV.nextValue({
        close: +close,
        volume: +volume,
      });

      const extended: NullableExtendedData = {
        candle: {
          high: +high,
          low: +low,
          open: +open,
          close: +close,
          volume: +volume,
          start,
        },
        ema_8: this.indicators.ema_8.nextValue(+close) || null,
        ema_13: this.indicators.ema_13.nextValue(+close) || null,
        ema_21: this.indicators.ema_21.nextValue(+close) || null,
        ema_55: this.indicators.ema_55.nextValue(+close) || null,
        bollinger_bands:
          this.indicators.bollinger_bands.nextValue(+close) || null,
        MACD: this.indicators.MACD.nextValue(+close) || null,
        vol: volume,
        RSI: this.indicators.RSI.nextValue(+close) || null,
        ADX: this.indicators.ADX.nextValue(+high, +low, +close) || null,
        ATR,
        ATR_percent: ATR / +close || null,
        stochRSI:
          this.indicators.stochRSI.nextValue(+high, +low, +close) || null,
        HA: this.indicators.HA.nextValue(+open, +high, +low, +close) || null,
        CCI: this.indicators.CCI.nextValue(+high, +low, +close) || null,
        ChaikinOS:
          this.indicators.ChaikinOS.nextValue(+high, +low, +close, volume) ||
          null,
        ROC: this.indicators.ROC.nextValue(+close) || null,
        PSAR: this.indicators.PSAR.nextValue(+high, +low, +close) || null,
        OBV: onBalanceVol || null,
        OBV_RSI: this.indicators.OBV_RSI.nextValue(onBalanceVol ?? 0) || null,
        OBV_SMA: this.indicators.OBV_SMA.nextValue(onBalanceVol ?? 0) || null,
        VWAP:
          this.indicators.VWAP.nextValue({
            close: +close,
            open: +open,
            high: +high,
            low: +low,
            volume,
          }) || null,
        VWAP_deviation:
          this.indicators.VWAP_deviation.nextValue(+close, volume) || null,
      };

      return extended;
    });

    return data;
  }

  async handleNewCandle(candle: GeneratedCandle | Candle) {
    const { high, low, close, open, volume, start } = candle;

    const onBalanceVol = this.indicators.OBV.nextValue({
      close: +close,
      volume: +volume,
    });

    const vwap = this.indicators.VWAP.nextValue({
      close: +close,
      high: +high,
      low: +low,
      volume: +volume,
    });

    const ATR = this.indicators.ATR.nextValue(+high, +low, +close);
    const obj: Indicators = {
      ema_8: this.indicators.ema_8.nextValue(+close),
      ema_13: this.indicators.ema_13.nextValue(+close),
      ema_21: this.indicators.ema_21.nextValue(+close),
      ema_55: this.indicators.ema_55.nextValue(+close),
      bollinger_bands: this.indicators.bollinger_bands.nextValue(+close),
      MACD: this.indicators.MACD.nextValue(+close),
      vol: volume,
      RSI: this.indicators.RSI.nextValue(+close),
      ADX: this.indicators.ADX.nextValue(+high, +low, +close),
      ATR,
      ATR_percent: (ATR / +close) * 100,
      stochRSI: this.indicators.stochRSI.nextValue(+high, +low, +close),
      candle: {
        high: +high,
        low: +low,
        open: +open,
        close: +close,
        volume: +volume,
        start,
      },
      HA: this.indicators.HA.nextValue(+open, +high, +low, +close),
      CCI: this.indicators.CCI.nextValue(+high, +low, +close),
      ChaikinOS: this.indicators.ChaikinOS.nextValue(
        +high,
        +low,
        +close,
        volume
      ),
      ROC: this.indicators.ROC.nextValue(+close),
      PSAR: this.indicators.PSAR.nextValue(+high, +low, +close),
      OBV: onBalanceVol,
      OBV_RSI: this.indicators.OBV_RSI.nextValue(onBalanceVol ?? 0),
      OBV_SMA: this.indicators.OBV_SMA.nextValue(onBalanceVol ?? 0),
      VWAP: vwap,
      VWAP_deviation: this.indicators.VWAP_deviation.nextValue(+close, volume),
    };

    return obj;
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

export { GenerateIndicators };
