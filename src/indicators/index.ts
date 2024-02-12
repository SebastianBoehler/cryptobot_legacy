import mongodb from '../mongodb'
import { differenceInMinutes, format, setMilliseconds, setSeconds, subDays, subMinutes } from 'date-fns'
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
} from '@debut/indicators'
import { OBV, VWAP } from 'technicalindicators'
import { VWAPDeviation } from './vwap_deviation'
import { AvgCandleSize } from './avg_candle_size'
import { Candle, GeneratedCandle, Indicators } from 'cryptobot-types'
import { logger } from '../utils'

class GenerateIndicators {
  private symbol: string
  private mongodb: mongodb
  private granularity: number
  private hadInitialCall = false

  //timestamp of when the last candle was added
  private lastTimestamp: string = ''

  public prevValues: Indicators | null = null
  public lastValues: Indicators | null = null

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
    ATR: new ATR(14, 'EMA'),
    HA: new HeikenAshi(),
    CCI: new CCI(20),
    ChaikinOS: new ChaikinOscillator(3, 10),
    ROC: new ROC(14),
    PSAR: new PSAR(0.02, 0.2, 0.2),
    OBV: new OBV({ close: [], volume: [] }),
    OBV_RSI: new RSI(5),
    OBV_SMA: new SMA(5),
    VWAP: new VWAP({ close: [], high: [], low: [], volume: [] }),
    VWAP_deviation: new VWAPDeviation(false, 'Average Deviation', 60),
    avgCandleSize: new AvgCandleSize(200),
  }

  private data: Indicators[] = []

  constructor(exchange: string, symbol: string, granularity: number) {
    this.symbol = symbol
    this.stopRepainting = this.stopRepainting.bind(this)
    this.mongodb = new mongodb(exchange)
    this.granularity = granularity
  }

  async getIndicators(timestamp: Date) {
    const repaintNo = await this.stopRepainting(timestamp, this.granularity)
    //open of current REPAINTING candle
    let adjustedTimestamp = subMinutes(timestamp, repaintNo)
    adjustedTimestamp = setSeconds(adjustedTimestamp, 0)
    adjustedTimestamp = setMilliseconds(adjustedTimestamp, 0)

    if (repaintNo < 1 && this.lastTimestamp !== format(timestamp, 'yyyy-MM-dd HH:mm') && this.hadInitialCall) {
      let indicators: Indicators | undefined = this.data.shift()
      if (!indicators) {
        const newCandle = await this.mongodb.generateCandle(this.granularity, adjustedTimestamp.getTime(), this.symbol)
        if (!newCandle) throw new Error(`[indicators] No data found for ${this.symbol} at ${adjustedTimestamp}`)
        indicators = this.handleNewCandle(newCandle)
      }
      logger.debug('new candle added', {
        start: indicators.candle.start,
        symbol: this.symbol,
        timestamp: format(timestamp, 'yyyy-MM-dd HH:mm'),
      })

      this.lastTimestamp = format(timestamp, 'yyyy-MM-dd HH:mm')
      this.prevValues = this.lastValues
      this.lastValues = indicators
      return indicators
    }

    if (this.hadInitialCall) {
      if (!this.lastValues) throw new Error('[indicators] lastValues is null but isnt first call')
      return this.lastValues
    }

    const afterTimestamp = subDays(timestamp, 30)
    if (this.data.length < 1) await this.loadHistoricData(afterTimestamp)

    const filtered = this.data.filter((indicator) => indicator.candle.start.getTime() < adjustedTimestamp.getTime())
    this.data = this.data.slice(filtered.length)
    const values = filtered.pop()
    if (!values) return

    this.hadInitialCall = true

    this.lastValues = values
    return values
  }

  async loadHistoricData(afterTimestamp?: Date) {
    const candles = await this.mongodb.loadHistoricCandles(this.granularity, this.symbol, afterTimestamp)

    const data = candles.map((candle) => {
      return this.handleNewCandle(candle)
    })

    this.data = data
    return data
  }

  private handleNewCandle(candle: GeneratedCandle | Candle) {
    const { high, low, close, open, volume, start } = candle

    const onBalanceVol = this.indicators.OBV.nextValue({
      close: +close,
      volume: +volume,
    })

    const vwap = this.indicators.VWAP.nextValue({
      close: +close,
      high: +high,
      low: +low,
      volume: +volume,
    })

    const ATR = this.indicators.ATR.nextValue(+high, +low, +close)
    const obj: Indicators = {
      granularity: this.granularity,
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
      ChaikinOS: this.indicators.ChaikinOS.nextValue(+high, +low, +close, volume),
      ROC: this.indicators.ROC.nextValue(+close),
      PSAR: this.indicators.PSAR.nextValue(+high, +low, +close),
      OBV: onBalanceVol,
      OBV_RSI: this.indicators.OBV_RSI.nextValue(onBalanceVol ?? 0),
      OBV_SMA: this.indicators.OBV_SMA.nextValue(onBalanceVol ?? 0),
      VWAP: vwap,
      VWAP_deviation: this.indicators.VWAP_deviation.nextValue(+close, volume),
      avgCandleSize: this.indicators.avgCandleSize.nextValue(+high, +low),
    }

    return obj
  }

  private async stopRepainting(timestamp: Date, granularity: number) {
    const zero = new Date('1970-01-01T00:15:00')
    let mins = differenceInMinutes(timestamp, zero)
    if (mins % granularity == 0) {
      return 0
    } else {
      for (let b = 1; b <= granularity; b++) {
        if ((mins - b) % granularity == 0) {
          return b
        }
      }
    }
    return 0
  }
}

export { GenerateIndicators }
