import { Indicators, Strategy } from 'cryptobot-types'
import { createUniqueId } from '../utils'
import { Base } from './base'

export class GridStrategy extends Base implements Strategy {
  public readonly name = 'grid'
  public readonly startCapital = 1000

  public async update(price: number, indicators: Indicators[], time: Date) {
    if (!this.orderHelper) throw new Error(`[${this.name}] OrderHelper not initialized`)
    if (!this.orderHelper.identifier) this.orderHelper.identifier = `${this.name}-${this.symbol}-${createUniqueId(10)}`
    await this.orderHelper.update(price, time)
    this.addOptionalPositionInfo(price)

    const indicatorMap = this.mapIndicators(indicators)
    const entryConditions = [indicatorMap[15].ATR < indicatorMap[15].avgCandleSize]
    const shouldEnter = entryConditions.every((condition) => condition === true)

    const amount = (this.startCapital + this.orderHelper.profitUSD) / 6

    const position = this.orderHelper.position
    if (!position) {
      if (shouldEnter) {
        if (indicatorMap[15].RSI < 35) await this.orderHelper.openOrder('long', amount)
        else if (indicatorMap[15].RSI > 75) await this.orderHelper.openOrder('short', amount)
      }
      return
    }
    const { type, orders, unrealizedPnlPcnt } = position
    const entries = orders.filter((o) => o.action === 'open')
    const lastOrder = entries[entries.length - 1]
    const priceChange = price / lastOrder.avgPrice
    const profitInDecimal = type === 'long' ? priceChange - 1 : 1 - priceChange

    //new grid order
    if (profitInDecimal < -0.005 && orders.length < 6) {
      await this.orderHelper.openOrder(type, amount)
      return
    }

    if (unrealizedPnlPcnt > 10 || unrealizedPnlPcnt < -5) {
      await this.orderHelper.closeOrder(position.ctSize)
      return
    }
  }
}
