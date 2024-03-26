import { Indicators } from 'cryptobot-types'
import { createUniqueId } from '../utils'
import { ILiveOrderHelper, IOrderHelper } from '../types'
import { LiveOrderHelper as OkxLiveOrderHelper, OrderHelper as OkxOrderHelper } from '../okx/orderHelper'
import { OrderHelper as BybitOrderHelper, LiveOrderHelper as BybitLiveOrderHelper } from '../bybit/orderHelper'

export class Base {
  public orderHelper: IOrderHelper | ILiveOrderHelper | undefined
  public readonly name: string = 'base'
  public symbol: string | undefined
  public multiplier = 1
  public requiresIndicators = false

  public async initalize(symbol: string, exchange: string, saveToMongo?: boolean, live: boolean = false) {
    this.symbol = symbol
    this.orderHelper = getOrderHelper(live, exchange, symbol, saveToMongo)
    await this.orderHelper.getContractInfo()
  }

  public mapIndicators(indicators: Indicators[]) {
    const obj: Record<number, Indicators> = {}

    for (const indicator of indicators) {
      obj[indicator.granularity] = indicator
    }

    return obj
  }

  public addOptionalPositionInfo(price: number, highestPrice?: number, lowestPrice?: number) {
    if (!this.orderHelper?.position) return

    const { position } = this.orderHelper

    if (highestPrice) position.highestPrice = highestPrice
    if (lowestPrice) position.lowestPrice = lowestPrice

    if (!position.highestPrice || price > position.highestPrice) position.highestPrice = price
    if (!position.lowestPrice || price < position.lowestPrice) position.lowestPrice = price
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
