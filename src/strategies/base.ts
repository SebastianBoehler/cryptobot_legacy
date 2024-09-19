import { Indicators } from 'cryptobot-types'
import { createUniqueId, logger, isLiveOrderHelper } from '../utils'
import { ILiveOrderHelper, IOrderHelper } from '../types'
import { LiveOrderHelper as OkxLiveOrderHelper, OrderHelper as OkxOrderHelper } from '../okx/orderHelper'
import { OrderHelper as BybitOrderHelper, LiveOrderHelper as BybitLiveOrderHelper } from '../bybit/orderHelper'

interface OptionalPosInfo {
  price: number
  highestPrice?: number
  lowestPrice?: number
}

export class Base {
  public orderHelper: IOrderHelper | ILiveOrderHelper | undefined
  public readonly name: string = 'base'
  public shouldEndTrading = false
  public symbol: string | undefined
  public multiplier = 1
  public stopLoss = -30
  public requiresIndicators = false
  public leverReduce = -60

  public async initalize(symbol: string, exchange: string, saveToMongo?: boolean, live: boolean = false) {
    this.symbol = symbol
    this.orderHelper = getOrderHelper(live, exchange, symbol, saveToMongo)
    if (isLiveOrderHelper(this.orderHelper)) {
      this.orderHelper.initialize()
    }
    await this.orderHelper.getContractInfo()
  }

  public mapIndicators(indicators: Indicators[]) {
    const obj: Record<number, Indicators> = {}

    for (const indicator of indicators) {
      obj[indicator.granularity] = indicator
    }

    return obj
  }

  public addOptionalPositionInfo({ price, highestPrice, lowestPrice }: OptionalPosInfo) {
    if (!this.orderHelper?.position) return

    const { position } = this.orderHelper

    if (highestPrice) position.highestPrice = highestPrice
    if (lowestPrice) position.lowestPrice = lowestPrice

    if (!position.highestPrice || price > position.highestPrice) position.highestPrice = price
    if (!position.lowestPrice || price < position.lowestPrice) position.lowestPrice = price

    //calc max drawdown
    if (position.unrealizedPnlPcnt) {
      const drawdown = position.unrealizedPnlPcnt
      if (drawdown < -100) {
        logger.error('drawdown below -100', drawdown, position.leverage)
      }
      if (!position.maxDrawdown || drawdown < position.maxDrawdown) {
        position.maxDrawdown = drawdown
      }
    }
  }

  public calculateEntrySizeUSD() {
    throw new Error('Method not implemented.')
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

const getOrderHelper = (live: boolean, exchange: string, symbol: string, saveToMongo?: boolean) => {
  if (exchange.toLowerCase() === 'okx') {
    if (live) return new OkxLiveOrderHelper(symbol)
    else return new OkxOrderHelper(symbol, saveToMongo)
  }
  if (exchange.toLowerCase() === 'bybit') {
    if (live) return new BybitLiveOrderHelper(symbol)
    else return new BybitOrderHelper(symbol, saveToMongo)
  }

  throw new Error('Exchange not supported')
}
