import { Indicators, Strategy } from 'cryptobot-types'
import { Base } from './base'
import { createUniqueId, logger } from '../utils'
import { differenceInMinutes } from 'date-fns'
import { isLiveOrderHelper } from '../types'

let initialSizeInCts: number
let lastLeverIncrease: number | null

export class BUILD_SCALP_FAST_ALTS extends Base implements Strategy {
  public readonly name = 'scalp-fast-alts'
  public startCapital = 250
  public steps = 6
  public multiplier = 0.95
  public stopLoss = -80

  async update(price: number, indicators: Indicators[], time: Date) {
    if (!this.orderHelper) throw new Error(`[${this.name}] OrderHelper not initialized`)
    if (!this.orderHelper.identifier) this.orderHelper.identifier = `${this.name}-${this.symbol}-${createUniqueId(10)}`

    await this.orderHelper.update(price, time, indicators)
    if (price === 0) return
    this.addOptionalPositionInfo({ price })

    //TODO: try with more steps as leverage increased
    const { entrySizeUSD, portfolio } = this.calculateEntrySizeUSD<{
      entrySizeUSD: number
      portfolio: number
    }>()
    const { position } = this.orderHelper
    logger.debug({ entrySizeUSD, portfolio })

    //USE CLOSE PRICE OF INDICATORS GRANULARITY X FOR TRIGGERS

    if (!position) {
      if (this.shouldEndTrading) return
      const clOrdId = 'first' + createUniqueId(10)
      await this.orderHelper.setLeverage(2, 'long', portfolio)
      lastLeverIncrease = null
      if (entrySizeUSD > portfolio) {
        logger.error(`[Strategy] Entry size is higher than portfolio`)
        return
      }
      const order = await this.orderHelper.openOrder('long', entrySizeUSD, clOrdId)
      if (order) initialSizeInCts = order.size
      return
    }

    if (this.shouldEndTrading) {
      await this.orderHelper.closeOrder(position.ctSize, 'reduce' + createUniqueId(10))
      return
    }

    if (!lastLeverIncrease && isLiveOrderHelper(this.orderHelper)) {
      const lastIncrease = await this.orderHelper.loadLastLeverIncrease()
      if (lastIncrease) lastLeverIncrease = lastIncrease.price
    }

    const { orders, avgEntryPrice, leverage, highestPrice, ctSize, unrealizedPnlPcnt, margin } = position
    if (!highestPrice) throw new Error(`[${this.name}] Extreme prices not set`)
    //May happen due to restart
    if (!initialSizeInCts) {
      logger.debug('initialSizeInCts not set')
      initialSizeInCts = orders[0].size
    }

    const lastOrder = orders[orders.length - 1]
    const DCAs = orders.filter((o) => o.ordId.startsWith('buydca'))
    const lastDCA = DCAs[DCAs.length - 1]

    if (unrealizedPnlPcnt < this.stopLoss) {
      const ordId = 'loss' + createUniqueId(10)
      await this.orderHelper.closeOrder(ctSize, ordId)
      return
    }

    if (unrealizedPnlPcnt < -60 && leverage > 2) {
      await this.orderHelper.setLeverage(leverage - 1, position.type, portfolio)
      return
    }

    //RESET HIGHESTPRICE IF PRICE < AVG ENTRY PRICE
    if (price < avgEntryPrice) {
      this.addOptionalPositionInfo({
        price,
        highestPrice: price,
      })
    }

    //INCREASE POSITION IF PRICE IS BELOW AVG ENTRY PRICE
    const buyingPowerInCts = this.orderHelper.convertUSDToContracts(price, entrySizeUSD * leverage)
    if (buyingPowerInCts > this.orderHelper.minSize) {
      if (price < avgEntryPrice * 0.975 * this.multiplier && price < lastOrder.avgPrice * 0.975 * this.multiplier) {
        const ordId = 'buylow' + createUniqueId(6)
        if (entrySizeUSD < portfolio) {
          await this.orderHelper.openOrder('long', entrySizeUSD, ordId)
          return
        } else logger.debug(`[Strategy] Buy amount is higher than portfolio ${entrySizeUSD} ${portfolio}`)
      }

      if (price < highestPrice * 0.95 * this.multiplier && price > avgEntryPrice * 1.05) {
        let buyAmountUSD = margin * 0.2
        const ordId = 'buyhigh' + createUniqueId(6)
        if (entrySizeUSD < portfolio) {
          await this.orderHelper.openOrder('long', buyAmountUSD, ordId)
        } else logger.debug(`[Strategy] Buy amount is higher than portfolio ${entrySizeUSD} ${portfolio}`)
      }
    }

    if (unrealizedPnlPcnt > 50 && price > lastOrder.avgPrice * 1.07 * this.multiplier) {
      const reduceByMax = ctSize - initialSizeInCts
      const reduceBy = Math.floor(reduceByMax / 6)
      if (reduceBy > this.orderHelper.minSize) {
        const ordId = 'tp' + createUniqueId(10)
        await this.orderHelper.closeOrder(reduceBy, ordId)
        return
      }
    }

    const timeDiff = differenceInMinutes(time, lastDCA?.time || new Date())
    const cond = !lastDCA || timeDiff > 30

    if (price > avgEntryPrice * 1.2 && cond) {
      let buyAmountUSD = entrySizeUSD
      const ratio = 1 - margin / buyAmountUSD
      if (ratio > 0.1) {
        buyAmountUSD = margin * 0.3
      }
      const ordId = 'buydca' + createUniqueId(6)
      if (buyAmountUSD < portfolio) {
        await this.orderHelper.openOrder('long', buyAmountUSD, ordId)
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
      await this.orderHelper.setLeverage(leverage + 3, 'long', portfolio)
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

    if (ctSize > initialSizeInCts && price < avgEntryPrice * 1.005 && highestPrice > avgEntryPrice * 1.15) {
      const reduceCtsAmount = ctSize - initialSizeInCts
      const ordId = 'reduce' + createUniqueId(10)
      if (reduceCtsAmount > 0) {
        await this.orderHelper.closeOrder(reduceCtsAmount, ordId)
        return
      }
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
