import { CloseOrder, ClosedPosition, Indicators, Order, Position } from 'cryptobot-types'
import MongoWrapper from '../mongodb'
import { createUniqueId, logger, sleep } from '../utils'
import { omit } from 'lodash'
import { ILiveOrderHelper, IOrderHelper, IOrderHelperPos } from '../types'
import { BybitClient } from './utils'
import config from '../config/config'
import { createHash } from 'node:crypto'

const client = new BybitClient(config.BYBIT_KEY, config.BYBIT_SECRET)
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
    client.setSymbol(symbol)
  }

  public setLeverage(leverage: number, _type: 'long' | 'short', availCapital: number) {
    if (leverage < 1) return
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

      let updatedMargin: number

      if (ratio > 1) {
        const marginLeft = margin / ratio
        //0.95 to be safe
        const reducedBy = (margin - marginLeft) * 0.95
        updatedMargin = margin - reducedBy
      } else {
        //increase margin
        const marginRequired = margin / ratio
        const increaseBy = (marginRequired - margin) * 1.05
        if (increaseBy > availCapital) {
          logger.debug(`[orderHelper > setLeverage] Not enough capital to increase margin`)
          return
        }
        updatedMargin = margin + increaseBy
      }

      this.position = {
        ...this.position,
        margin: updatedMargin,
        leverage,
        liquidationPrice: this.calculateLiquidationPrice(),
      }
    }
    this.leverage = leverage
  }

  public async getContractInfo() {
    const instruments = await client.getInstruments()
    const instrument = instruments.find((instrument) => instrument.symbol === this.symbol)
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
      symbol: this.symbol,
      accHash: 'backtester',
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
      accHash: 'backtester',
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
      symbol: this.symbol,
      accHash: 'backtester',
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

export class LiveOrderHelper implements ILiveOrderHelper {
  private symbol: string
  private maxLever: number | null = null
  public position: IOrderHelperPos | null = null
  private lotSizeFilter: LotSizeFilter | undefined
  public leverage: number = 0
  public minSize: number = 0
  public price: number = 0
  public identifier: string | undefined
  public profitUSD = 0
  public lastPosition: ClosedPosition | null = null
  private positionId: string = `TT${createUniqueId(10)}TT`
  accHash: string = createHash('sha256').update(config.BYBIT_KEY).digest('hex')

  constructor(symbol: string) {
    this.symbol = symbol
    client.setSymbol(symbol)
    client.subscribeToTicker(symbol)
    client.subscribeToPosition()
    client.subscribeToOrder()
    client.subscribeToExecution()
    client.loadLivePosition(symbol)
  }

  private trimToStep(value: number, step: number) {
    const inverse = 1 / step
    return Math.floor(value * inverse) / inverse
  }

  public async setLeverage(leverage: number, _type: 'long' | 'short', availCapital: number) {
    if (leverage < 1) return
    const maxLever = this.maxLever || 100
    if (leverage > maxLever && this.leverage < maxLever) leverage = maxLever
    if (leverage > maxLever) {
      logger.debug(`[orderHelper > setLeverage] Leverage cannot be higher than ${maxLever}`)
      return
    }

    const ratio = leverage / this.leverage
    const margin = this.position?.margin || 0

    if (margin > 100_000 && leverage > 6) return
    if (margin > 200_000 && leverage > 4) return

    if (ratio > 1) {
      //decrease margin all good
    } else {
      //increase margin
      const marginRequired = margin / ratio
      const increaseBy = marginRequired - margin
      if (increaseBy > availCapital) {
        logger.debug(`[orderHelper > setLeverage] Not enough capital to increase margin`)
        return
      }
    }

    await client.setLeverage(this.symbol, leverage)
    this.leverage = leverage

    if (!client.position || !this.position) return

    this.position = {
      ...this.position,
      margin: +client.position.margin,
      liquidationPrice: client.position.liqPrice,
      leverage: +client.position.lever,
    }
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

  public async getContractInfo() {
    const instruments = await client.getInstruments()
    const instrument = instruments.find((instrument) => instrument.symbol === this.symbol)
    if (!instrument) {
      throw new Error(`[orderHelper] Instrument for ${this.symbol} not found`)
    }

    this.lotSizeFilter = instrument.lotSizeFilter
    this.maxLever = +instrument.leverageFilter.maxLeverage
    this.minSize = +this.lotSizeFilter.minOrderQty
  }

  public async update(_price: number, _time: Date, indicators?: Indicators[]) {
    if (!client.lastTicker) throw new Error('[orderHelper > update] No ticker data found')
    this.price = +client.lastTicker.lastPrice

    if (!client.position && this.position) {
      logger.warn('[orderHelper > update] Position not found, but position existing in orderHelper')
      await sleep(1_000)
      const closedPos = client.closedPositions.find((pos) => pos.posId === this.position!.posId)
      if (closedPos) {
        const margin = +closedPos.margin
        const ordId = closedPos.gotLiquidated ? 'liq-unknown' : 'unknown'
        const orderObj: CloseOrder = {
          ordId,
          posId: closedPos.posId,
          avgPrice: closedPos.liqPrice,
          posAvgEntryPrice: closedPos.avgEntryPrice,
          size: closedPos.ctSize,
          action: 'close',
          margin,
          lever: +closedPos.lever,
          //TODO: get fee from liq event
          fee: 0,
          time: new Date(),
          bruttoPnlUSD: -margin,
          symbol: this.symbol,
          accHash: this.accHash,
        }

        this.profitUSD += orderObj.bruttoPnlUSD + this.position.fee
        const realizedFee = this.position.fee

        //@ts-ignore
        const closedPosObj: ClosedPosition = {
          ...this.position,
          realizedPnlUSD: -margin + this.position.fee,
          orders: [...this.position.orders, orderObj],
          symbol: this.symbol,
          type: this.position.type,
          ctSize: 0,
          margin: 0,
          leverage: this.leverage,
          identifier: this.identifier || 'unknown',
        }
        this.position = null
        this.lastPosition = closedPosObj

        this.positionId = `TT${createUniqueId(5)}TT`
        await mongo.writeOrder({
          ...orderObj,
          realizedFee,
          realizedPnlUSD: this.profitUSD,
        })
        await mongo.writePosition(closedPosObj, 'trader')
      }
    }

    if (!client.position) return
    let orders = this.position?.orders || []
    let savedPos = this.position
    if (!this.position || orders.length === 0) {
      savedPos = await mongo.getLivePosition(client.position.posId)

      if (savedPos) {
        //@ts-ignore
        delete savedPos.timestamp
        //@ts-ignore
        delete savedPos.strategy
        orders = savedPos.orders
        this.position = savedPos
      }

      this.leverage = +client.position.lever
    }
    if (!this.position) return

    const unrealizedPnlUSD = this.calculateProfit(this.price, client.position.ctSize, client.position.type)
    const unrealizedPnlPcnt = (unrealizedPnlUSD / +client.position.margin) * 100

    this.position = {
      //use if no position existing otherwise overwrite with proper values
      highestPrice: client.position.avgEntryPrice,
      lowestPrice: client.position.avgEntryPrice,
      ...this.position,
      //everything that MUST be updated after ...this.position
      type: client.position.type,
      posSide: client.position.posSide,
      avgEntryPrice: +client.position.avgEntryPrice,
      fee: orders.reduce((acc, curr) => acc + curr.fee, 0),
      realizedPnlUSD: +client.position.realizedPnlUsd,
      unrealizedPnlUSD,
      posId: client.position.posId,
      ctSize: +client.position.ctSize,
      amountUSD: +client.position.margin,
      unrealizedPnlPcnt,
      margin: +client.position.margin,
      leverage: +client.position.lever,
      liquidationPrice: +client.position.liqPrice,
    }

    //TODO: add proper type
    // @ts-ignore
    if (savedPos && savedPos.profitUSD) this.profitUSD = savedPos.profitUSD
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

    const positionPre = client.position
    const clOrdId = (ordId || createUniqueId(10)) + this.positionId
    const order = await client.placeMarketOrder(this.symbol, 'Buy', baseAmount, clOrdId).catch((e) => {
      if (e.message.includes('ab not enough for new order')) {
        logger.error(`[orderHelper > openOrder] Insufficient balance for ${this.symbol}`)
        return
      }
      throw e
    })
    if (!order) return

    await sleep(1_000)
    const details = await client.getOrderDetails(order.orderLinkId)

    while (!client.position || client.position.margin === positionPre?.margin) {
      await sleep(100)
    }

    //logger.debug('position', client.position)
    const posId = client.position.posId

    const fee = -+details.cumExecFee
    const orderObj: Order = {
      ordId: order.orderLinkId,
      posId,
      avgPrice: +details.avgPrice,
      posAvgEntryPrice: client.position.avgEntryPrice,
      size: baseAmount,
      action: 'open',
      margin: +client.position.margin - +(positionPre?.margin || 0),
      lever: this.leverage,
      fee,
      time: new Date(+details.createdTime),
      symbol: this.symbol,
      accHash: this.accHash,
    }

    //use pos.reliazedPnlUSD + closed pos profits
    //this.profitUSD += orderObj.fee

    const orders = this.position?.orders || []
    orders.push(orderObj)
    const avgEntryPrice = client.position.avgEntryPrice
    // const fee = this.calculateFee(amountContracts * contractValue)
    // const ctSize = (this.position?.ctSize || 0) + amountContracts

    this.position = {
      ...this.position,
      symbol: this.symbol,
      posId,
      type,
      posSide: client.position.posSide,
      ctSize: client.position.ctSize,
      margin: +client.position.margin,
      leverage: +client.position.lever,
      avgEntryPrice,
      liquidationPrice: client.position.liqPrice,
      unrealizedPnlPcnt: +client.position.uplUsd / +client.position.margin,
      unrealizedPnlUSD: +client.position.uplUsd,
      realizedPnlUSD: client.position.realizedPnlUsd,
      orders,
      fee: client.position.fee,
      amountUSD: (this.position?.amountUSD || 0) + amountUSD,
      accHash: this.accHash,
    }

    await mongo.writeOrder({
      ...orderObj,
      realizedFee: this.position.fee,
      realizedPnlUSD: this.profitUSD + this.position.realizedPnlUSD,
    })

    return orderObj
  }

  public async closeOrder(amountCts: number, ordId?: string) {
    if (!this.position || !client.position) throw new Error('[orderHelper] No position found')
    if (!this.lotSizeFilter) throw new Error('[orderHelper] No contract info found')
    if (!this.leverage) throw new Error('[orderHelper] Leverage not set')
    if (amountCts > this.position.ctSize) throw new Error('[orderHelper] Cannot close more contracts than open')

    const posId = client.position.posId
    const realizedProfitPre = this.position.realizedPnlUSD
    const positionsPre = client.position
    const marginPre = +positionsPre.margin
    const clOrdId = (ordId || createUniqueId(10)) + this.positionId
    const order = await client.placeMarketOrder(this.symbol, 'Sell', amountCts, clOrdId)
    await sleep(1_000)
    const details = await client.getOrderDetails(order.orderLinkId)

    while (realizedProfitPre === client.position?.realizedPnlUsd) {
      //logger.debug('waiting for position update', realizedProfitPre, client.position?.realizedPnlUsd)
      await sleep(100)
    }

    const orderFee = -+details.cumExecFee
    const pnl = this.calculateProfit(this.price, amountCts, this.position.type)

    const marginPost = +client.position?.margin || 0
    const withdrawnMargin = marginPre - marginPost

    const orderObj: CloseOrder = {
      ordId: order.orderLinkId,
      posId,
      avgPrice: +details.avgPrice,
      posAvgEntryPrice: this.position.avgEntryPrice,
      size: amountCts,
      action: 'close',
      margin: withdrawnMargin,
      lever: this.leverage,
      fee: orderFee,
      time: new Date(+details.createdTime),
      bruttoPnlUSD: pnl,
      symbol: this.symbol,
      accHash: this.accHash,
    }

    const orders = this.position?.orders || []
    orders.push(orderObj)

    const closeOrders = orders.filter((order) => order.action === 'close') as CloseOrder[]
    const bruttoProfits = closeOrders.map((order) => order.bruttoPnlUSD)
    const realizedFee = this.position.fee + orderFee
    const realizedPnlUSD = bruttoProfits.reduce((acc, curr) => acc + curr, 0) + realizedFee

    //this.profitUSD += orderObj.bruttoPnlUSD + orderObj.fee

    if (!client.position) {
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
      this.profitUSD += closedPos.realizedPnlUSD

      this.positionId = `TT${createUniqueId(10)}TT`

      await mongo.writeOrder({
        ...orderObj,
        realizedFee,
        realizedPnlUSD: this.profitUSD,
      })
      await mongo.writePosition(closedPos, 'trader')
      return closedPos
    }

    const fee = client.position.fee
    this.position = {
      ...this.position,
      posId,
      ctSize: client.position.ctSize,
      orders,
      fee,
      margin: +client.position.margin,
      realizedPnlUSD: client.position.realizedPnlUsd,
    }
    await mongo.writeOrder({
      ...orderObj,
      realizedFee,
      realizedPnlUSD: this.profitUSD + realizedPnlUSD,
    })

    return order
  }

  public closedPositions() {
    return client.closedPositions
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
