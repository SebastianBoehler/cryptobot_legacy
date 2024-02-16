import { Indicators } from 'cryptobot-types'
import { LiveOrderHelper, OrderHelper } from '../orderHelper'

export class Base {
  public orderHelper: OrderHelper | LiveOrderHelper | undefined
  public symbol: string | undefined
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
    if (!this.orderHelper?.lastPosition) return
    const { lastPosition } = this.orderHelper

    const { realizedPnlUSD, amountUSD } = lastPosition

    return amountUSD + realizedPnlUSD
  }

  public end() {}
}
