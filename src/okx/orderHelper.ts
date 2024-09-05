import { CloseOrder, ClosedPosition, Indicators, Order, Position } from 'cryptobot-types'
import MongoWrapper from '../mongodb'
import { OkxClient } from './utils'
import { createUniqueId, logger, sleep } from '../utils'
import { omit } from 'lodash'
import { ILiveOrderHelper, IOrderHelper, IOrderHelperPos } from '../types'
import { createHash } from 'node:crypto'
import config from '../config/config'
import { addAction, addOrder, initializePda } from '../solana/solana'

const okxClient = new OkxClient({
  apiKey: config.OKX_KEY,
  apiSecret: config.OKX_SECRET,
  apiPass: config.OKX_PASS,
})
const mongo = new MongoWrapper('backtests')

export class OrderHelper implements IOrderHelper {
  private symbol: string
  private ctVal: number | null = null
  private ctMult: number | null = null
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
  private indicators: Indicators[] | undefined

  constructor(symbol: string, saveToMongo?: boolean) {
    this.symbol = symbol
    this.saveToMongo = saveToMongo || false
  }

  public async setLeverage(leverage: number, _type: 'long' | 'short', availCapital: number) {
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
        //reduce to be safe
        const reducedBy = (margin - marginLeft) * 0.98
        updatedMargin = margin - reducedBy
      } else {
        //increase margin
        const marginRequired = (margin / ratio) * 1.014
        const increaseBy = marginRequired - margin
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
    const instruments = await okxClient.getInstruments()
    const instrument = instruments.find((instrument) => instrument.instId === this.symbol)
    if (!instrument) {
      throw new Error(`[orderHelper] Instrument for ${this.symbol} not found`)
    }
    this.ctVal = +instrument.ctVal
    this.ctMult = +instrument.ctMult
    this.maxLever = +instrument.lever
    this.minSize = +instrument.minSz
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
    if (posSizeInUSD < 0) throw new Error('[orderHelper > calculateFee] Position size must be positive')
    const fee = posSizeInUSD * 0.0005
    return -fee
  }

  public update(price: number, time: Date, indicators?: Indicators[]) {
    this.price = price
    this.time = time
    this.indicators = indicators || []
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
      posAvgEntryPrice: 0,
      action: 'open',
      lever: this.leverage,
      margin,
      fee: this.calculateFee(amountContracts * contractValue),
      time: this.time,
      symbol: this.symbol,
      accHash: 'backtester',
      indicators: this.indicators,
    }

    const orders = this.position?.orders || []
    const avgEntryPrice = this.calculateAvgEntryPrice([...orders, order])
    const fee = this.calculateFee(amountContracts * contractValue)
    const ctSize = (this.position?.ctSize || 0) + amountContracts

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
      margin: (avgEntryPrice * this.ctVal * this.ctMult * ctSize) / this.leverage,
      leverage: this.leverage,
      avgEntryPrice,
      liquidationPrice: this.calculateLiquidationPrice(avgEntryPrice, type),
      unrealizedPnlPcnt: this.position?.unrealizedPnlPcnt || 0,
      unrealizedPnlUSD: this.position?.unrealizedPnlUSD || 0,
      orders,
      fee: (this.position?.fee || 0) + fee,
      amountUSD: (this.position?.amountUSD || 0) + amountUSD,
      accHash: 'backtester',
      posIdx: this.lastPosition?.posIdx || 0,
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
    const margin = (amountCts * this.position.avgEntryPrice * this.ctVal * this.ctMult) / this.leverage

    const order: CloseOrder = {
      ordId: ordId || createUniqueId(32),
      avgPrice: this.price,
      size: amountCts,
      action: 'close',
      margin,
      lever: this.leverage,
      fee,
      time: this.time,
      bruttoPnlUSD: pnl,
      posAvgEntryPrice: this.position.avgEntryPrice,
      symbol: this.symbol,
      accHash: 'backtester',
      indicators: this.indicators,
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

  public calculatePriceForPnl(pnl: number, amountCt: number, type: 'long' | 'short') {
    if (!this.ctVal || !this.ctMult) throw new Error('[orderHelper] No contract info found')
    if (!amountCt) throw new Error('[orderHelper] No contracts specified')
    if (!this.position) throw new Error('[orderHelper] No position found')

    const entryPrice = this.position.avgEntryPrice
    const entryValue = entryPrice * amountCt * this.ctVal * this.ctMult

    let exitValue = 0
    if (type === 'long') {
      exitValue = entryValue + pnl
    } else if (type === 'short') {
      exitValue = entryValue - pnl
    }

    const exitPrice = exitValue / (amountCt * this.ctVal * this.ctMult)
    return exitPrice
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

export class LiveOrderHelper implements ILiveOrderHelper {
  private symbol: string
  private ctVal: number | null = null
  private ctMult: number | null = null
  private maxLever: number | null = null
  public position: IOrderHelperPos | null = null
  public leverage: number = 0
  public minSize: number = 0
  public price: number = 0
  public identifier: string | undefined
  public profitUSD = 0
  public lastPosition: ClosedPosition | null = null
  private positionId: string = `TT${createUniqueId(10)}TT`
  accHash: string = createHash('sha256').update(config.OKX_KEY).digest('hex')

  constructor(symbol: string) {
    this.symbol = symbol
    okxClient.subscribeToPriceData(symbol)
    okxClient.subscribeToPositionData(symbol)
    okxClient.subsribeToOrderData(symbol)
  }

  public async setLeverage(leverage: number, type: 'long' | 'short', availCapital: number) {
    if (leverage < 1) return
    const maxLever = this.maxLever || 100
    if (leverage > maxLever && this.leverage < maxLever) leverage = maxLever
    if (leverage > maxLever) {
      logger.debug(`[orderHelper > setLeverage] Leverage cannot be higher than ${maxLever}`)
      return
    }

    const prevLever = this.leverage

    if (!this.position || !okxClient.position) {
      await okxClient.setLeverage(this.symbol, leverage, 'isolated', type)
      this.leverage = leverage
      return
    }

    const margin = this.position.margin
    const posSide = okxClient.position.posSide
    const marginInfo = await okxClient
      .getAdjustLeverageInfo('SWAP', 'isolated', leverage.toString(), posSide, this.symbol)
      .catch((e) => {
        logger.error(`[orderHelper > setLeverage] Error loading leverage info`, e)
      })
    if (!marginInfo) return
    const estMgn = +marginInfo.estMgn

    let marginChange = +marginInfo.estAvailTrans * -1 // means how much margins to transfer out
    //FIXME: if no value returned
    if (marginInfo.estAvailTrans.length < 1) {
      logger.debug(`[orderHelper > setLeverage] No margin change value returned, calculating manually`)
      const leverIncrease = prevLever < leverage
      switch (leverIncrease) {
        case true:
          marginChange = estMgn - margin
          break
        case false:
          marginChange = margin - estMgn
          break
      }
    }
    logger.debug(`[orderHelper > setLeverage] EstMgn: ${estMgn}, Margin: ${margin}, MarginChange: ${marginChange}`)
    logger.debug(`[orderHelper > setLeverage] current leverage: ${okxClient.position.lever}, new leverage: ${leverage}`)
    logger.debug(`[orderHelper > setLeverage] availCapital: ${availCapital}`)

    logger.debug(JSON.stringify(marginInfo, null, 2))
    logger.debug('[orderhelper > setLeverage]', margin - estMgn)

    if (marginChange === 0) {
      logger.error('[orderhelper > setLeverage] margin change is zero on lev change')
      await okxClient.setLeverage(this.symbol, leverage, 'isolated', type)
    }

    if (marginChange > 0) {
      const increaseBy = marginChange * 1.01
      if (increaseBy > availCapital) {
        logger.debug(`[orderHelper > setLeverage] Not enough capital to increase margin`)
        return
      }
      logger.debug(`[orderHelper > setLeverage] Increase margin by ${increaseBy}`)
      await this.increaseMargin(increaseBy.toFixed(2))
      await sleep(1_000)
      await okxClient.setLeverage(this.symbol, leverage, 'isolated', type)
      this.leverage = leverage
    }
    if (marginChange < 0) {
      const reducedBy = marginChange * 0.99 * -1
      logger.debug(`[orderHelper > setLeverage] Reduce margin by ${reducedBy}`)
      await okxClient.setLeverage(this.symbol, leverage, 'isolated', type)
      this.leverage = leverage
      await sleep(1_000)
      await this.reduceMargin(reducedBy.toFixed(2))
    }

    await sleep(1_000)

    this.position = {
      ...this.position,
      margin: +okxClient.position.margin,
      liquidationPrice: okxClient.position.liqPrice,
      leverage: +okxClient.position.lever,
    }

    const baseAction = {
      symbol: this.symbol,
      posId: okxClient.position.posId,
      accHash: this.accHash,
      price: this.price,
      time: new Date(),
    }

    const levChangeAction = {
      ...baseAction,
      action: 'leverage change',
      prev: prevLever,
      after: leverage,
    }
    const mmChangeAction = {
      ...baseAction,
      action: 'margin change',
      prev: margin,
      after: +okxClient.position.margin,
    }

    await mongo.storeAction([levChangeAction, mmChangeAction])
    await Promise.allSettled([
      //TODO: closedPos is reset on every restart find better way
      addAction(levChangeAction, this.position.posIdx),
      addAction(mmChangeAction, this.position.posIdx),
    ])
  }

  private async reduceMargin(amount: string) {
    if (!this.position) throw new Error('[orderHelper > reduceMargin] No position found')
    const posSide = okxClient.position?.posSide || this.position.posSide
    logger.debug(`[orderHelper > reduceMargin] Reduce margin by ${amount}`)
    await okxClient.reduceMargin(this.symbol, posSide, amount)
  }

  private async increaseMargin(amount: string) {
    if (!this.position) throw new Error('[orderHelper > increaseMargin] No position found')
    const posSide = okxClient.position?.posSide || this.position.posSide
    logger.debug(`[orderHelper > increaseMargin] Increase margin by ${amount}`)
    await okxClient.increaseMargin(this.symbol, posSide, amount)
  }

  public async getContractInfo() {
    const instruments = await okxClient.getInstruments()
    const instrument = instruments.find((instrument) => instrument.instId === this.symbol)
    if (!instrument) {
      throw new Error(`[orderHelper] Instrument for ${this.symbol} not found`)
    }
    this.ctVal = +instrument.ctVal
    this.ctMult = +instrument.ctMult
    this.maxLever = +instrument.lever
    this.minSize = +instrument.minSz
  }

  public async update(_price: number, _time: Date, indicators?: Indicators[]) {
    if (!okxClient.lastTicker) throw new Error('[orderHelper > update] No ticker data found')
    this.price = +okxClient.lastTicker.last

    if (!okxClient.position && this.position) {
      logger.warn('[orderHelper > update] Position not found, but position existing in orderHelper')
      await sleep(1_000)
      const closedPos = okxClient.closedPositions.reverse().find((pos) => pos.posId === this.position!.posId)
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

    if (!okxClient.position) return
    let orders = this.position?.orders || []
    let savedPos = this.position
    if (orders.length < 1) {
      savedPos = await mongo.getLivePosition(okxClient.position.posId)
      if (savedPos) {
        //@ts-ignore
        delete savedPos.timestamp
        //@ts-ignore
        delete savedPos.strategy
        orders = savedPos.orders
        //@ts-ignore
        this.profitUSD = savedPos.profitUSD
      }
      if (orders.length < 1) {
        logger.debug('loading orders with id', okxClient.position.posId)
        orders = await mongo.getLiveOrders({ posId: okxClient.position.posId }, undefined, { time: 1 })
      }
    }

    const unrealizedPnlPcnt = +okxClient.position.profit * 100
    const unrealizedPnlUSD = +okxClient.position.uplUsd

    this.leverage = +okxClient.position.lever
    this.position = {
      symbol: this.symbol,
      orders,
      //use if no position existing otherwise overwrite with proper values
      highestPrice: okxClient.position.avgEntryPrice,
      lowestPrice: okxClient.position.avgEntryPrice,
      posIdx: 0,
      ...savedPos,
      ...this.position,
      //everything that MUST be updated after ...this.position
      type: okxClient.position.type,
      posSide: okxClient.position.posSide,
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
      accHash: this.accHash,
    }

    return this.position
  }

  public async openOrder(type: 'long' | 'short', amountUSD: number, ordId?: string) {
    if (!this.ctVal || !this.ctMult) throw new Error('[orderHelper] No contract info found')
    if (this.position && this.position.type !== type)
      throw new Error('[orderHelper] Cannot open position in different direction')
    if (!this.leverage) throw new Error('[orderHelper] Leverage not set')

    const amountContracts = Math.floor((amountUSD * this.leverage) / this.price / this.ctVal / this.ctMult)
    logger.debug('amountContracts', amountContracts, amountUSD, this.leverage, this.price, this.ctVal, this.ctMult)

    if (amountContracts < 1) return

    const positionPre = okxClient.position
    const clOrdId = (ordId || createUniqueId(10)) + this.positionId
    const order = await okxClient
      .placeMarketOrder(this.symbol, 'buy', amountContracts, clOrdId, false, type)
      .catch(async (e) => {
        const errData = e.data[0]
        if (errData.sMsg.includes('Insufficient USDT balance in account.')) {
          logger.warn('Insufficient balance')
          return
        }
        if (errData.sCode === '51004' && errData.sMsg.includes('Please lower the leverage') && this.leverage > 25) {
          logger.error('Leverage too high for position size, reducing leverage')
          //WARN: this will cause a loop if leverage is too high
          await this.setLeverage(this.leverage - 1, type, Infinity)
          return
        }
        throw e
      })
    if (!order) return

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
      posAvgEntryPrice: okxClient.position.avgEntryPrice,
      size: amountContracts,
      action: 'open',
      margin: +okxClient.position.margin - +(positionPre?.margin || 0),
      lever: this.leverage,
      fee,
      time: new Date(+details.cTime),
      symbol: this.symbol,
      accHash: this.accHash,
    }

    //use pos.reliazedPnlUSD + closed pos profits
    //this.profitUSD += orderObj.fee

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
      posSide: okxClient.position.posSide,
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
      accHash: this.accHash,
      posIdx: this.lastPosition?.posIdx || 0,
    }

    const baseAction = {
      symbol: this.symbol,
      posId: okxClient.position.posId,
      accHash: this.accHash,
      price: this.price,
      time: new Date(),
    }

    const promises = [
      mongo.writeOrder({
        ...orderObj,
        realizedFee: this.position.fee,
        realizedPnlUSD: this.profitUSD + this.position.realizedPnlUSD,
      }),
      mongo.storeAction([
        {
          ...baseAction,
          action: 'margin change',
          prev: positionPre?.margin || 0,
          after: +okxClient.position.margin,
        },
      ]),
    ]

    try {
      await Promise.allSettled(promises)
      if (!positionPre) await initializePda(this.position, this.closedPositions.length + 1)
      await addOrder(orderObj, okxClient.closedPositions.length + 1)
    } catch (error) {
      logger.error('Error during open order', error)
    }

    return orderObj
  }

  public async closeOrder(amountCts: number, ordId?: string) {
    if (!this.position || !okxClient.position) throw new Error('[orderHelper] No position found')
    if (!this.ctVal || !this.ctMult) throw new Error('[orderHelper] No contract info found')
    if (!this.leverage) throw new Error('[orderHelper] Leverage not set')
    if (amountCts > this.position.ctSize) throw new Error('[orderHelper] Cannot close more contracts than open')

    const posId = okxClient.position.posId
    const positionPre = this.position
    const realizedProfitPre = positionPre.realizedPnlUSD
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
    const pnl = +details.pnl

    const marginPost = +okxClient.position?.margin || 0
    const withdrawnMargin = marginPre - marginPost

    const orderObj: CloseOrder = {
      ordId: order.clOrdId,
      posId,
      avgPrice: +details.avgPx,
      posAvgEntryPrice: this.position.avgEntryPrice,
      size: amountCts,
      action: 'close',
      margin: withdrawnMargin,
      lever: this.leverage,
      fee: orderFee,
      time: new Date(+details.cTime),
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
    const baseAction = {
      symbol: this.symbol,
      posId: okxClient.position?.posId || positionPre.posId,
      accHash: this.accHash,
      price: this.price,
      time: new Date(),
    }

    if (!okxClient.position) {
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

      this.positionId = `TT${createUniqueId(5)}TT`
      await Promise.allSettled([
        mongo.storeAction([
          {
            ...baseAction,
            action: 'margin change',
            prev: positionPre?.margin || 0,
            after: 0,
          },
        ]),
        mongo.writeOrder({
          ...orderObj,
          realizedFee,
          realizedPnlUSD: this.profitUSD,
        }),
      ])
      await mongo.writePosition(closedPos, 'trader')
      //TODO: delete livePosition
      await addOrder(orderObj, okxClient.closedPositions.length + 1)
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
      realizedPnlUSD: okxClient.position.realizedPnlUsd,
    }

    await Promise.allSettled([
      mongo.storeAction([
        {
          ...baseAction,
          action: 'margin change',
          prev: positionPre?.margin || 0,
          after: +okxClient.position.margin,
        },
      ]),
      mongo.writeOrder({
        ...orderObj,
        realizedFee,
        realizedPnlUSD: this.profitUSD + realizedPnlUSD,
      }),
    ])

    await addOrder(orderObj, okxClient.closedPositions.length + 1)

    return order
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

  public async loadLastLeverIncrease() {
    const action = await mongo.loadLastLeverIncrease(this.symbol, this.accHash, this.positionId)
    return action
  }
}
