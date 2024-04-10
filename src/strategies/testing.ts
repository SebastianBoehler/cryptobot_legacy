import { Indicators, Strategy } from 'cryptobot-types'
import { Base } from './base'
import { createUniqueId } from '../utils'
import { differenceInSeconds } from 'date-fns'

export class TESTING extends Base implements Strategy {
  public readonly name = 'testing'
  public startCapital = 80
  public steps = 1

  async update(price: number, indicators: Indicators[], time: Date) {
    if (!this.orderHelper) throw new Error(`[${this.name}] OrderHelper not initialized`)
    if (!this.orderHelper.identifier) this.orderHelper.identifier = `${this.name}-${this.symbol}-${createUniqueId(10)}`

    await this.orderHelper.update(price, time)
    if (price === 0) return
    this.addOptionalPositionInfo(price)

    const { entrySizeUSD, portfolio } = this.calculateEntrySizeUSD<{
      entrySizeUSD: number
      portfolio: number
    }>()
    const { position } = this.orderHelper

    if (!position) {
      const clOrdId = 'first' + createUniqueId(10)
      await this.orderHelper.setLeverage(5, 'long', portfolio)
      await this.orderHelper.openOrder('long', entrySizeUSD, clOrdId)
      return
    }

    const { orders, leverage, ctSize } = position
    const lastOrder = orders[orders.length - 1]

    if (differenceInSeconds(time, lastOrder.time) > 25) {
      await this.orderHelper.setLeverage(leverage - 1, 'long', portfolio)
    }

    if (differenceInSeconds(time, lastOrder.time) > 60) {
      await this.orderHelper.closeOrder(ctSize)
    }

    return
  }

  calculateEntrySizeUSD<T>(steps: number = this.steps): T {
    if (!this.orderHelper) throw new Error(`[${this.name}] OrderHelper not initialized`)
    const { position } = this.orderHelper
    const inPosition = position ? position.margin : 0
    const profit = this.orderHelper.profitUSD
    const realizedProfits = position && 'realizedPnlUSD' in position ? position.realizedPnlUSD : 0
    const portfolio = this.startCapital + profit - inPosition + realizedProfits

    const entrySizeUSD = portfolio / steps

    return { entrySizeUSD, portfolio } as T
  }
  async end() {
    if (!this.orderHelper) throw new Error(`[${this.name}] OrderHelper not initialized`)
    const { position } = this.orderHelper
    if (position) {
      const ordId = 'end' + createUniqueId(10)
      await this.orderHelper.closeOrder(position.ctSize, ordId)
    }
  }
}
