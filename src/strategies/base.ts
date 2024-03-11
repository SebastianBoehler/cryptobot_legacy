import { Indicators } from 'cryptobot-types'
import { LiveOrderHelper, OrderHelper } from '../orderHelper'
import { createUniqueId } from '../utils'

export class Base {
  public orderHelper: OrderHelper | LiveOrderHelper | undefined
  public readonly name: string = 'base'
  public symbol: string | undefined
  public multiplier = 1
  public requiresIndicators = false

  public async initalize(symbol: string, saveToMongo?: boolean, live?: boolean) {
    this.symbol = symbol
    this.orderHelper = live ? new LiveOrderHelper(symbol) : new OrderHelper(symbol, saveToMongo)
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
