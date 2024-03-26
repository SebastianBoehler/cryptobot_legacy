import { CloseOrder, ClosedPosition, Indicators, Order, Position } from 'cryptobot-types'
import MongoWrapper from '../mongodb'
import { createUniqueId, logger } from '../utils'
import { omit } from 'lodash'
import { IOrderHelper } from '../types'
import { RestClientV5 } from 'bybit-api'
const client = new RestClientV5()
const mongo = new MongoWrapper('backtests')

interface LotSizeFilter {
  maxOrderQty: string
  minOrderQty: string
  qtyStep: string
  postOnlyMaxOrderQty?: string | undefined
}

export class OrderHelper implements IOrderHelper {
  private symbol: string
  private lotSizeFilter: LotSizeFilter | undefined
  private maxLever: number | null = null
  public leverage: number = 0
  public minSize: number = 0
  public position: Position | null = null
  private time: Date = new Date(0)
  public price: number = 0
  private saveToMongo: boolean = false
  public identifier: string | undefined
  public lastPosition: ClosedPosition | null = null
  public profitUSD = 0

  constructor(symbol: string, saveToMongo?: boolean) {
    this.symbol = symbol
    this.saveToMongo = saveToMongo || false
  }

  public setLeverage(leverage: number) {
    const maxLever = this.maxLever || 100
    if (leverage > maxLever && this.leverage < maxLever) leverage = maxLever
    if (leverage > maxLever) {
      logger.debug(`[orderHelper > setLeverage] Leverage cannot be higher than ${maxLever}`)
      return
    }

    const prevLeverage = this.leverage

    //adjusting leverage
    if (this.position) {
      const ratio = leverage / prevLeverage
      const margin = this.position.margin

      if (margin > 100_000 && leverage > 6) return
      if (margin > 200_000 && leverage > 4) return

      const marginLeft = margin / ratio
      //0.95 to be safe
      const reduceBy = (margin - marginLeft) * 0.95

      this.position = {
        ...this.position,
        margin: margin - reduceBy,
        leverage,
        liquidationPrice: this.calculateLiquidationPrice(),
      }
    }
    this.leverage = leverage
  }

  public async getContractInfo() {
    const { result } = await client.getInstrumentsInfo({ category: 'linear' })
    const instrument = result.list.find((instrument) => instrument.symbol === this.symbol)
    if (!instrument) {
      throw new Error(`[orderHelper] Instrument for ${this.symbol} not found`)
    }

    this.lotSizeFilter = instrument.lotSizeFilter
    this.maxLever = +instrument.leverageFilter.maxLeverage
    this.minSize = +this.lotSizeFilter.minOrderQty
  }

  private calculateAvgEntryPrice(orders: (Order | CloseOrder)[]) {
    let total = 0
    let totalContracts = 0
    const opens = orders.filter((order) => order.action === 'open')
    for (const order of opens) {
      total += order.avgPrice * order.size
      totalContracts += order.size
    }
    const avg = total / totalContracts
    return avg
  }

  //TODO: fix
  private calculateLiquidationPrice(avgEntryPrice?: number, type?: 'long' | 'short') {
    //we get liquidated as soon as we loose 100% margin. That is lost e.g. when we use 10x lever and price moves 10% against us
    const { position } = this
    if (!position && !avgEntryPrice) throw new Error('[orderHelper > calculateLiquidationPrice] No position found')

    return 0
  }

  private calculateFee(posSizeInUSD: number) {
    const fee = posSizeInUSD * 0.00055
    return -fee
  }

  private trimToStep(value: number, step: number) {
    const inverse = 1 / step
    return Math.floor(value * inverse) / inverse
  }

  public update(price: number, time: Date, indicators?: Indicators[]) {
    this.price = price
    this.time = time
    if (!this.position) return
    const { type } = this.position

    const bruttoPnl = this.calculateProfit(price, this.position.ctSize, type)
    const unrealizedPnlUSD = bruttoPnl + this.position.fee
    const unrealizedPnlPcnt = (unrealizedPnlUSD / this.position.margin) * 100
    const liquidationPrice = this.calculateLiquidationPrice()

    this.position = {
      ...this.position,
      unrealizedPnlPcnt,
      unrealizedPnlUSD,
      liquidationPrice,
    }

    return this.position
  }

  public async openOrder(type: 'long' | 'short', amountUSD: number, ordId?: string) {
    if (!this.lotSizeFilter) throw new Error('[orderHelper] No contract info found')
    if (this.position && this.position.type !== type)
      throw new Error('[orderHelper] Cannot open position in different direction')
    if (!this.leverage) throw new Error('[orderHelper] Leverage not set')

    const quoteAmount = amountUSD * this.leverage
    const baseAmount = this.trimToStep(quoteAmount / this.price, +this.lotSizeFilter.qtyStep)

    if (baseAmount < +this.lotSizeFilter.minOrderQty) return

    const margin = (baseAmount * this.price) / this.leverage
    const fee = this.calculateFee(baseAmount * this.price)
    const order: Order = {
      ordId: ordId || createUniqueId(32),
      avgPrice: this.price,
      size: baseAmount,
      posAvgEntryPrice: 0,
      action: 'open',
      lever: this.leverage,
      margin,
      fee,
      time: this.time,
    }

    const orders = this.position?.orders || []
    const avgEntryPrice = this.calculateAvgEntryPrice([...orders, order])
    const ctSize = (this.position?.ctSize || 0) + baseAmount

    this.profitUSD += order.fee

    orders.push({
      ...order,
      posAvgEntryPrice: avgEntryPrice,
    })

    this.position = {
      symbol: this.symbol,
      type,
      posSide: 'net',
      ctSize,
      margin: (avgEntryPrice * ctSize) / this.leverage,
      leverage: this.leverage,
      avgEntryPrice,
      liquidationPrice: this.calculateLiquidationPrice(avgEntryPrice, type),
      unrealizedPnlPcnt: this.position?.unrealizedPnlPcnt || 0,
      unrealizedPnlUSD: this.position?.unrealizedPnlUSD || 0,
      orders,
      fee: (this.position?.fee || 0) + fee,
      amountUSD: (this.position?.amountUSD || 0) + amountUSD,
    }

    return order
  }

  public async closeOrder(baseAmount: number, ordId?: string) {
    if (!this.position) throw new Error('[orderHelper] No position found')
    if (!this.lotSizeFilter) throw new Error('[orderHelper] No contract info found')
    if (!this.leverage) throw new Error('[orderHelper] Leverage not set')
    if (baseAmount > this.position.ctSize) throw new Error('[orderHelper] Cannot close more contracts than open')

    const fee = this.calculateFee(baseAmount * this.price)
    const pnl = this.calculateProfit(this.price, baseAmount, this.position.type)
    const margin = (baseAmount * this.position.avgEntryPrice) / this.leverage

    const order: CloseOrder = {
      ordId: ordId || createUniqueId(32),
      avgPrice: this.price,
      size: baseAmount,
      action: 'close',
      margin,
      lever: this.leverage,
      fee,
      time: this.time,
      bruttoPnlUSD: pnl,
      posAvgEntryPrice: this.position.avgEntryPrice,
    }

    const orders = this.position?.orders || []
    orders.push(order)
    const ctSize = this.position.ctSize - baseAmount

    this.position = {
      ...this.position,
      ctSize,
      fee: this.position.fee + fee,
      margin: (this.position.avgEntryPrice * ctSize) / this.leverage,
    }

    const closeOrders = orders.filter((order) => order.action === 'close') as CloseOrder[]
    const bruttoProfits = closeOrders.map((order) => order.bruttoPnlUSD)
    const realizedPnlUSD = bruttoProfits.reduce((acc, curr) => acc + curr, 0) + this.position.fee
    this.profitUSD += order.bruttoPnlUSD + order.fee

    if (this.position.ctSize <= 0) {
      //FIXME: cant really determine invested capital
      const spentMargin = 1
      const closedPos: ClosedPosition = {
        ...omit(this.position, ['unrealizedPnlPcnt', 'unrealizedPnlUSD']),
        realizedPnlUSD,
        realizedPnlPcnt: (realizedPnlUSD / spentMargin) * 100,
        identifier: this.identifier || 'unknown',
      }

      if (this.saveToMongo) {
        await mongo.writePosition(closedPos)
      }
      this.lastPosition = closedPos
      this.position = null
    }

    return order
  }

  private calculateProfit(price: number, baseAmount: number, type: 'long' | 'short') {
    if (!baseAmount) throw new Error('[orderHelper] No contracts specified')
    if (!this.position) throw new Error('[orderHelper] No position found')

    //calculate value of contracts in USD at entry price
    const entryPrice = this.position.avgEntryPrice
    const entryValue = entryPrice * baseAmount

    //calculate value of contracts in USD at exit price
    const exitPrice = price
    const exitValue = exitPrice * baseAmount

    let profit = 0
    if (type === 'long') {
      profit = exitValue - entryValue
    } else if (type === 'short') {
      profit = entryValue - exitValue
    }

    return profit
  }

  public convertUSDToContracts(price: number, amountUSD: number) {
    const { lotSizeFilter } = this
    if (!lotSizeFilter) throw new Error('[orderHelper > setLeverage] No contract info found')
    const ctSize = this.trimToStep(amountUSD / price, +lotSizeFilter.qtyStep)
    return ctSize
  }

  public contractUsdValue(price: number) {
    const { lotSizeFilter } = this
    if (!lotSizeFilter) throw new Error('[orderHelper > usdValueOfOneContract] No contract info found')
    const ctSize = 1
    const ctValue = ctSize * price
    return ctValue
  }
}
