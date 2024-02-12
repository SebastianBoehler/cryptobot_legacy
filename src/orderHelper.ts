import { CloseOrder, ClosedPosition, Indicators, Order, Position } from 'cryptobot-types'
import MongoWrapper from './mongodb'
import { OkxClient } from './okx/utils'
import { createUniqueId, sleep } from './utils'
import { omit } from 'lodash'
import config from './config/config'

const okxClient = new OkxClient()
const mongo = new MongoWrapper('backtests')
export class OrderHelper {
  private symbol: string
  private ctVal: number | null = null
  private ctMult: number | null = null
  public leverage: number = 0
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

  //TODO: return gained margin
  public setLeverage(leverage: number) {
    if (leverage > 100) {
      //logger.debug('[orderHelper > setLeverage] Leverage cannot be higher than 100')
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
    const instruments = await okxClient.getInstruments()
    const instrument = instruments.find((instrument) => instrument.instId === this.symbol)
    if (!instrument) {
      throw new Error(`[orderHelper] Instrument for ${this.symbol} not found`)
    }
    this.ctVal = +instrument.ctVal
    this.ctMult = +instrument.ctMult
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

  //TODO: load fee rate from okx during initialize process
  private calculateFee(posSizeInUSD: number) {
    const fee = posSizeInUSD * 0.0005
    return -fee
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
    if (!this.ctVal || !this.ctMult) throw new Error('[orderHelper] No contract info found')
    if (this.position && this.position.type !== type)
      throw new Error('[orderHelper] Cannot open position in different direction')
    if (!this.leverage) throw new Error('[orderHelper] Leverage not set')

    const amountContracts = Math.floor((amountUSD * this.leverage) / this.price / this.ctVal / this.ctMult)
    const contractValue = this.price * this.ctVal * this.ctMult

    if (amountContracts < 1) return

    const margin = (amountContracts * contractValue) / this.leverage
    const order: Order = {
      ordId: ordId || createUniqueId(32),
      avgPrice: this.price,
      size: amountContracts,
      action: 'open',
      lever: this.leverage,
      margin,
      fee: this.calculateFee(amountContracts * contractValue),
      time: this.time,
    }

    const orders = this.position?.orders || []
    const avgEntryPrice = this.calculateAvgEntryPrice([...orders, order])
    const fee = this.calculateFee(amountContracts * contractValue)
    const ctSize = (this.position?.ctSize || 0) + amountContracts

    orders.push({
      ...order,
      posAvgEntryPrice: avgEntryPrice,
    })

    this.position = {
      symbol: this.symbol,
      type,
      ctSize,
      margin: (avgEntryPrice * this.ctVal * this.ctMult * ctSize) / this.leverage,
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

  public async closeOrder(amountCts: number, ordId?: string) {
    if (!this.position) throw new Error('[orderHelper] No position found')
    if (!this.ctVal || !this.ctMult) throw new Error('[orderHelper] No contract info found')
    if (!this.leverage) throw new Error('[orderHelper] Leverage not set')
    if (amountCts > this.position.ctSize) throw new Error('[orderHelper] Cannot close more contracts than open')

    const contractValue = this.price * this.ctVal * this.ctMult

    const fee = this.calculateFee(amountCts * contractValue)
    const pnl = this.calculateProfit(this.price, amountCts, this.position.type)

    const order: CloseOrder = {
      ordId: ordId || createUniqueId(32),
      avgPrice: this.price,
      size: amountCts,
      action: 'close',
      margin: (amountCts * this.position.avgEntryPrice * this.ctVal * this.ctMult) / this.leverage,
      lever: this.leverage,
      fee,
      time: this.time,
      bruttoPnlUSD: pnl,
      posAvgEntryPrice: this.position.avgEntryPrice,
    }

    const orders = this.position?.orders || []
    orders.push(order)
    const ctSize = this.position.ctSize - amountCts

    this.position = {
      ...this.position,
      ctSize,
      fee: this.position.fee + fee,
      margin: (this.position.avgEntryPrice * this.ctVal * this.ctMult * ctSize) / this.leverage,
    }

    const closeOrders = orders.filter((order) => order.action === 'close') as CloseOrder[]
    const bruttoProfits = closeOrders.map((order) => order.bruttoPnlUSD)
    const realizedPnlUSD = bruttoProfits.reduce((acc, curr) => acc + curr, 0) + this.position.fee
    this.profitUSD += realizedPnlUSD

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

  private calculateProfit(price: number, amountCt: number, type: 'long' | 'short') {
    if (!this.ctVal || !this.ctMult) throw new Error('[orderHelper] No contract info found')
    if (!amountCt) throw new Error('[orderHelper] No contracts specified')
    if (!this.position) throw new Error('[orderHelper] No position found')

    //calculate value of contracts in USD at entry price
    const entryPrice = this.position.avgEntryPrice
    const entryValue = entryPrice * amountCt * this.ctVal * this.ctMult

    //calculate value of contracts in USD at exit price
    const exitPrice = price
    const exitValue = exitPrice * amountCt * this.ctVal * this.ctMult

    let profit = 0
    if (type === 'long') {
      profit = exitValue - entryValue
    } else if (type === 'short') {
      profit = entryValue - exitValue
    }

    return profit
  }

  public convertUSDToContracts(price: number, amountUSD: number) {
    const { ctMult, ctVal } = this
    if (!ctMult || !ctVal) throw new Error('[orderHelper > setLeverage] No contract info found')
    const ctSize = (amountUSD / price / ctVal) * ctMult
    return ctSize
  }

  public contractUsdValue(price: number) {
    const { ctMult, ctVal } = this
    if (!ctMult || !ctVal) throw new Error('[orderHelper > usdValueOfOneContract] No contract info found')
    const ctSize = 1
    const ctValue = ctSize * price * ctVal * ctMult
    return ctValue
  }
}

export interface LivePosition extends Position {
  realizedPnlUSD: number
  posId: string
}
export class LiveOrderHelper {
  private symbol: string
  private ctVal: number | null = null
  private ctMult: number | null = null
  public position: LivePosition | null = null
  public leverage: number = 0
  public price: number = 0
  public identifier: string | undefined
  public profitUSD = 0
  public lastPosition: ClosedPosition | null = null
  private positionId: string = `TT${createUniqueId(10)}TT`

  constructor(symbol: string) {
    this.symbol = symbol
    okxClient.subscribeToPriceData(symbol)
    okxClient.subscribeToPositionData(symbol)
    okxClient.subsribeToOrderData(symbol)
  }

  //TODO: return gained margin
  public async setLeverage(leverage: number, posSide?: 'long' | 'short') {
    if (leverage > 100) throw new Error('[orderHelper > setLeverage] Leverage cannot be higher than 100')

    if (config.IS_HEDGE) {
      posSide = 'long'
    }

    const prevLeverage = this.leverage
    await okxClient.setLeverage(this.symbol, leverage, 'isolated', posSide)
    this.leverage = leverage

    //INCREMENT LEVERAGE
    if (!this.position) return
    if (leverage > prevLeverage && okxClient.position) {
      const ratio = leverage / prevLeverage
      const margin = this.position.margin || 0

      const marginLeft = margin / ratio
      //0.95 to be safe
      const reduceBy = (margin - marginLeft) * 0.95

      //TODO: integrate https://www.okx.com/docs-v5/en/#trading-account-rest-api-get-leverage-estimated-info

      console.log('new margin', reduceBy, this.symbol)
      await this.reduceMargin(reduceBy.toString())

      await sleep(1_000)

      this.position = {
        ...this.position,
        margin: +okxClient.position.margin,
        liquidationPrice: okxClient.position.liqPrice,
        leverage: +okxClient.position.lever,
      }
    }
  }

  private async reduceMargin(amount: string) {
    if (!this.position) throw new Error('[orderHelper > reduceMargin] No position found')
    const posSide = okxClient.position?.posSide || this.position.type
    await okxClient.reduceMargin(this.symbol, posSide, amount)
    //catch and decrease amount, try again
  }

  public async getContractInfo() {
    const instruments = await okxClient.getInstruments()
    const instrument = instruments.find((instrument) => instrument.instId === this.symbol)
    if (!instrument) {
      throw new Error(`[orderHelper] Instrument for ${this.symbol} not found`)
    }
    this.ctVal = +instrument.ctVal
    this.ctMult = +instrument.ctMult
  }

  public async update(_price: number, _time: Date, indicators?: Indicators[]) {
    if (!okxClient.lastTicker) throw new Error('[orderHelper > update] No ticker data found')
    this.price = +okxClient.lastTicker.last

    if (!okxClient.position) return
    let orders = this.position?.orders || []
    let savedPos = this.position
    if (orders.length === 0) {
      orders = await mongo.getOrders<Order | CloseOrder>(okxClient.position.posId)
      savedPos = await mongo.getLivePosition(okxClient.position.posId)
    }

    const unrealizedPnlPcnt = +okxClient.position.profit * 100
    const unrealizedPnlUSD = +okxClient.position.uplUsd

    this.position = {
      symbol: this.symbol,
      orders,
      //use if no position existing otherwise overwrite with proper values
      highestPrice: okxClient.position.avgEntryPrice,
      lowestPrice: okxClient.position.avgEntryPrice,
      ...savedPos,
      ...this.position,
      //everything that MUST be updated after ...this.position
      type: okxClient.position.type,
      avgEntryPrice: +okxClient.position.avgEntryPrice,
      fee: +okxClient.position.fee,
      realizedPnlUSD: +okxClient.position.realizedPnlUsd,
      unrealizedPnlUSD,
      posId: okxClient.position.posId,
      ctSize: +okxClient.position.ctSize,
      amountUSD: +okxClient.position.margin,
      unrealizedPnlPcnt,
      margin: +okxClient.position.margin,
      leverage: +okxClient.position.lever,
      liquidationPrice: +okxClient.position.liqPrice,
    }
    return this.position
  }

  public async openOrder(type: 'long' | 'short', amountUSD: number, ordId?: string) {
    if (!this.ctVal || !this.ctMult) throw new Error('[orderHelper] No contract info found')
    if (this.position && this.position.type !== type)
      throw new Error('[orderHelper] Cannot open position in different direction')
    if (!this.leverage) throw new Error('[orderHelper] Leverage not set')

    const amountContracts = Math.floor((amountUSD * this.leverage) / this.price / this.ctVal / this.ctMult)

    if (amountContracts < 1) return

    const positionPre = okxClient.position
    const clOrdId = (ordId || createUniqueId(10)) + this.positionId
    const order = await okxClient.placeMarketOrder(this.symbol, 'buy', amountContracts, clOrdId, false, type)

    await sleep(1_000)
    const details = await okxClient.getOrderDetails(order.clOrdId, this.symbol)

    while (!okxClient.position || okxClient.position.margin === positionPre?.margin) {
      await sleep(100)
    }

    //logger.debug('position', okxClient.position)
    const posId = okxClient.position.posId

    const fee = +details.fee
    const orderObj: Order = {
      ordId: order.clOrdId,
      posId,
      avgPrice: +details.avgPx,
      size: amountContracts,
      action: 'open',
      margin: +okxClient.position.margin - +(positionPre?.margin || 0),
      lever: this.leverage,
      fee,
      time: new Date(+details.cTime),
    }

    const orders = this.position?.orders || []
    orders.push(orderObj)
    const avgEntryPrice = okxClient.position.avgEntryPrice
    // const fee = this.calculateFee(amountContracts * contractValue)
    // const ctSize = (this.position?.ctSize || 0) + amountContracts

    this.position = {
      ...this.position,
      symbol: this.symbol,
      posId,
      type,
      ctSize: okxClient.position.ctSize,
      margin: +okxClient.position.margin,
      leverage: +okxClient.position.lever,
      avgEntryPrice,
      liquidationPrice: okxClient.position.liqPrice,
      unrealizedPnlPcnt: +okxClient.position.uplUsd / +okxClient.position.margin,
      unrealizedPnlUSD: +okxClient.position.uplUsd,
      realizedPnlUSD: okxClient.position.realizedPnlUsd,
      orders,
      fee: okxClient.position.fee,
      amountUSD: (this.position?.amountUSD || 0) + amountUSD,
    }

    await mongo.writeOrder(orderObj)

    return orderObj
  }

  public async closeOrder(amountCts: number, ordId?: string) {
    if (!this.position || !okxClient.position) throw new Error('[orderHelper] No position found')
    if (!this.ctVal || !this.ctMult) throw new Error('[orderHelper] No contract info found')
    if (!this.leverage) throw new Error('[orderHelper] Leverage not set')
    if (amountCts > this.position.ctSize) throw new Error('[orderHelper] Cannot close more contracts than open')

    const posId = okxClient.position.posId
    const realizedProfitPre = this.position.realizedPnlUSD
    const positionsPre = okxClient.position
    const marginPre = +positionsPre.margin
    const clOrdId = (ordId || createUniqueId(10)) + this.positionId
    const order = await okxClient.placeMarketOrder(this.symbol, 'sell', amountCts, clOrdId, true, this.position.type)
    await sleep(1_000)
    const details = await okxClient.getOrderDetails(order.clOrdId, this.symbol)

    while (realizedProfitPre === okxClient.position?.realizedPnlUsd) {
      //logger.debug('waiting for position update', realizedProfitPre, okxClient.position?.realizedPnlUsd)
      await sleep(100)
    }

    const orderFee = +details.fee
    const pnl = this.calculateProfit(this.price, amountCts, this.position.type)

    const marginPost = +okxClient.position?.margin || 0
    const withdrawnMargin = marginPre - marginPost

    const orderObj: CloseOrder = {
      ordId: order.clOrdId,
      posId,
      avgPrice: this.price,
      size: amountCts,
      action: 'close',
      margin: withdrawnMargin,
      lever: this.leverage,
      fee: orderFee,
      time: new Date(+details.cTime),
      bruttoPnlUSD: pnl,
    }

    this.profitUSD += pnl

    const orders = this.position?.orders || []
    orders.push(orderObj)

    const closeOrders = orders.filter((order) => order.action === 'close') as CloseOrder[]
    const bruttoProfits = closeOrders.map((order) => order.bruttoPnlUSD)
    const realizedPnlUSD = bruttoProfits.reduce((acc, curr) => acc + curr, 0) - this.position.fee
    this.profitUSD = realizedPnlUSD

    if (!okxClient.position) {
      this.positionId = `TT${createUniqueId(5)}TT`

      //@ts-ignore
      const closedPos: ClosedPosition = {
        ...this.position,
        realizedPnlUSD,
        orders,
        symbol: this.symbol,
        type: this.position.type,
        ctSize: 0,
        margin: 0,
        leverage: this.leverage,
        identifier: this.identifier || 'unknown',
      }
      this.position = null
      this.lastPosition = closedPos

      await mongo.writeOrder(orderObj)
      await mongo.writePosition(closedPos, 'trader')
      return closedPos
    }

    const fee = okxClient.position.fee
    this.position = {
      ...this.position,
      posId,
      ctSize: okxClient.position.ctSize,
      orders,
      fee,
      margin: +okxClient.position.margin,
      realizedPnlUSD: okxClient.position.realizedPnlUsd + fee,
    }
    await mongo.writeOrder(orderObj)

    return order
  }

  private calculateProfit(price: number, amountCt: number, type: 'long' | 'short') {
    if (!this.ctVal || !this.ctMult) throw new Error('[orderHelper] No contract info found')
    if (!amountCt) throw new Error('[orderHelper] No contracts specified')
    if (!this.position) throw new Error('[orderHelper] No position found')

    //calculate value of contracts in USD at entry price
    const entryPrice = this.position.avgEntryPrice
    const entryValue = entryPrice * amountCt * this.ctVal * this.ctMult

    //calculate value of contracts in USD at exit price
    const exitPrice = price
    const exitValue = exitPrice * amountCt * this.ctVal * this.ctMult

    let profit = 0
    if (type === 'long') {
      profit = exitValue - entryValue
    } else if (type === 'short') {
      profit = entryValue - exitValue
    }

    return profit
  }

  public closedPositions() {
    return okxClient.closedPositions
  }

  //UTILS
  //TODO: one func for both helper
  public convertUSDToContracts(price: number, amountUSD: number) {
    const { ctMult, ctVal } = this
    if (!ctMult || !ctVal) throw new Error('[orderHelper > setLeverage] No contract info found')
    const ctSize = (amountUSD / price / ctVal) * ctMult
    return ctSize
  }

  public contractUsdValue(price: number) {
    const { ctMult, ctVal } = this
    if (!ctMult || !ctVal) throw new Error('[orderHelper > usdValueOfOneContract] No contract info found')
    const ctSize = 1
    const ctValue = ctSize * price * ctVal * ctMult
    return ctValue
  }
}
