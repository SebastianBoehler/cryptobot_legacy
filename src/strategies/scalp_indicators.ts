import { Indicators, Strategy } from 'cryptobot-types'
import { Base } from './base'
import { createUniqueId } from '../utils'

let initialSizeInCts: number
let lastLeverIncrease: number | null

export class BUILD_SCALP_FAST_INDICATORS extends Base implements Strategy {
  public readonly name = 'indicators'
  public startCapital = 250
  public steps = 6
  public multiplier = 0.95

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
    const mappedIndicators = this.mapIndicators(indicators)
    const indicators5min = mappedIndicators[5]

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
    const lastOrder = orders[orders.length - 1]

    //INCREASE POSITION IF PRICE IS BELOW AVG ENTRY PRICE
    const buyingPowerInCts = this.orderHelper.convertUSDToContracts(price, entrySizeUSD * leverage)
    if (buyingPowerInCts > 1 && indicators5min?.RSI < 55) {
      if (price < avgEntryPrice * 0.975 * this.multiplier && price < lastOrder.avgPrice * 0.975 * this.multiplier) {
        const ordId = 'buylow' + createUniqueId(6)
        await this.orderHelper.openOrder('long', entrySizeUSD, ordId)
        return
      }

      if (price < highestPrice * 0.95 * this.multiplier && price > avgEntryPrice * 1.05) {
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
    if (unrealizedPnlPcnt > 50 && price > lastOrder.avgPrice * 1.07 * this.multiplier) {
      const reduceByMax = ctSize - initialSizeInCts
      const reduceBy = Math.floor(reduceByMax / 6)
      if (reduceBy > 1) {
        const ordId = 'tp' + createUniqueId(10)
        await this.orderHelper.closeOrder(reduceBy, ordId)
        return
      }
    }

    //LEVERAGE INCREASE
    if (
      price > avgEntryPrice * 1.1 * this.multiplier &&
      leverage < 37 &&
      (!lastLeverIncrease || price > lastLeverIncrease * 1.025)
    ) {
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
    if (leverage >= 10 && price < avgEntryPrice * 1.005) {
      const ordId = 'reduce' + createUniqueId(10)
      await this.orderHelper.closeOrder(ctSize, ordId)
      return
    }

    //TODO: remove ctSize check and compare results
    if (ctSize > initialSizeInCts && price < avgEntryPrice * 1.005 && highestPrice > avgEntryPrice * 1.15) {
      const reduceCtsAmount = ctSize - initialSizeInCts
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

  async end() {
    if (!this.orderHelper) throw new Error(`[${this.name}] OrderHelper not initialized`)
    const { position } = this.orderHelper
    if (position) {
      const ordId = 'end' + createUniqueId(10)
      await this.orderHelper.closeOrder(position.ctSize, ordId)
    }
  }
}
