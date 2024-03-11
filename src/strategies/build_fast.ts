import { Indicators, Strategy } from 'cryptobot-types'
import { Base } from './base'
import { createUniqueId, logger } from '../utils'

let initialSizeInCts: number
let lastLeverIncrease: number | null

export class BUILD_FAST extends Base implements Strategy {
  public readonly name = 'build-fast'
  public startCapital = 250
  public steps = 3

  async update(price: number, indicators: Indicators[], time: Date) {
    if (!this.orderHelper) throw new Error(`[${this.name}] OrderHelper not initialized`)
    if (!this.orderHelper.identifier) this.orderHelper.identifier = `${this.name}-${this.symbol}-${createUniqueId(10)}`

    await this.orderHelper.update(price, time)
    if (price === 0) return
    this.addOptionalPositionInfo(price)

    //TODO: try with more steps as leverage increased
    const { entrySizeUSD } = this.calculateEntrySizeUSD<{
      entrySizeUSD: number
      portfolio: number
    }>()
    const { position } = this.orderHelper

    //USE CLOSE PRICE OF INDICATORS GRANULARITY X FOR TRIGGERS

    if (!position) {
      const clOrdId = 'first' + createUniqueId(10)
      await this.orderHelper.setLeverage(2, 'long')
      lastLeverIncrease = null
      const order = await this.orderHelper.openOrder('long', entrySizeUSD, clOrdId)
      if (order) initialSizeInCts = order.size
      return
    }

    const { orders, avgEntryPrice, leverage, highestPrice, ctSize, unrealizedPnlPcnt, margin } = position
    if (!highestPrice) throw new Error(`[${this.name}] Extreme prices not set`)
    //May happen due to restart
    if (!initialSizeInCts) {
      logger.debug('initialSizeInCts not set')
      initialSizeInCts = orders[0].size
    }
    const lastOrder = orders[orders.length - 1]

    //INCREASE POSITION IF PRICE IS BELOW AVG ENTRY PRICE
    const buyingPowerInCts = this.orderHelper.convertUSDToContracts(price, entrySizeUSD * leverage)
    if (buyingPowerInCts > 1) {
      if (price < avgEntryPrice * 0.95 && price < lastOrder.avgPrice * 0.95) {
        const ordId = 'buylow' + createUniqueId(6)
        await this.orderHelper.openOrder('long', entrySizeUSD, ordId)
        return
      }

      if (price < highestPrice * 0.9 && price > avgEntryPrice * 1.1) {
        let buyAmountUSD = entrySizeUSD
        const ratio = 1 - margin / buyAmountUSD
        if (ratio > 0.95) {
          buyAmountUSD = margin * 16.5
        }
        const ordId = 'buyhigh' + createUniqueId(6)
        await this.orderHelper.openOrder('long', buyAmountUSD, ordId)
        return
      }
    }

    //TAKE PROFITS
    if (unrealizedPnlPcnt > 80 && price > lastOrder.avgPrice * 1.1) {
      const reduceByMax = ctSize - initialSizeInCts
      const reduceBy = Math.floor(reduceByMax / 6)
      if (reduceBy > 1) {
        const ordId = 'tp' + createUniqueId(10)
        await this.orderHelper.closeOrder(reduceBy, ordId)
        return
      }
    }

    //LEVERAGE INCREASE
    if (price > avgEntryPrice * 1.2 && leverage < 37 && (!lastLeverIncrease || price > lastLeverIncrease * 1.05)) {
      const marginPre = margin
      await this.orderHelper.setLeverage(leverage + 3, 'long')
      lastLeverIncrease = price
      const marginPost = this.orderHelper.position?.margin || 0
      const gainedCapital = marginPre - marginPost
      const entrySizeUSD = gainedCapital / 12
      const ordId = 'lev' + createUniqueId(10)
      await this.orderHelper.openOrder('long', entrySizeUSD, ordId)
      return
    }

    //SCALE DOWN IF LEVERAGE IS TOO HIGH AND WE FELL TO price < avgEntryPrice * 1.02
    //IF UPPER CASE DOESNT COVER IT
    if (highestPrice > avgEntryPrice * 1.05 && ctSize > initialSizeInCts && price < avgEntryPrice * 1.02) {
      //SCALE DOWN ONCE PRICE WAS 10% ABOVE AVG ENTRY PRICE AND WE FELL AGAIN
      const reduceCtsAmount = leverage > 2 ? ctSize : ctSize - initialSizeInCts
      const ordId = 'reduce' + createUniqueId(10)
      if (reduceCtsAmount > 0) {
        await this.orderHelper.closeOrder(reduceCtsAmount, ordId)
        return
      }
    }

    if (unrealizedPnlPcnt < -80) {
      const ordId = 'loss' + createUniqueId(10)
      await this.orderHelper.closeOrder(ctSize, ordId)
      return
    }

    //RESET HIGHESTPRICE IF PRICE < AVG ENTRY PRICE
    if (price < avgEntryPrice) {
      this.addOptionalPositionInfo(price, price)
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
}
