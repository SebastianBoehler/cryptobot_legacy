import { Base } from './base'
import { createUniqueId } from '../utils'
import { Indicators, Strategy } from 'cryptobot-types'

export class BollingerBandsStrategy extends Base implements Strategy {
  public readonly name = 'bollingerBands'
  public readonly startCapital = 1000

  async update(price: number, indicators: Indicators[], time: Date) {
    if (!this.orderHelper) throw new Error(`[${this.name}] OrderHelper not initialized`)
    if (!this.orderHelper.identifier) this.orderHelper.identifier = `${this.name}-${this.symbol}-${createUniqueId(10)}`
    await this.orderHelper.update(price, time)
    this.addOptionalPositionInfo(price)

    const indicatorMap = this.mapIndicators(indicators)

    const { upper, lower, middle } = indicatorMap[60].bollinger_bands
    const { position } = this.orderHelper

    const entrySize = this.calculateEntrySizeUSD() || this.startCapital

    if (!position) {
      if (price < lower) {
        this.orderHelper.openOrder('long', entrySize)
      }
      if (price > upper) {
        this.orderHelper.openOrder('short', entrySize)
      }
      return
    }

    const { type, ctSize } = position

    if (type === 'long') {
      if (price > middle) {
        await this.orderHelper.closeOrder(ctSize)
      }
    }

    if (type === 'short') {
      if (price < middle) {
        await this.orderHelper.closeOrder(ctSize)
      }
    }
  }
}
