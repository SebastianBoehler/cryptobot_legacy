import { RestClientV5, WebsocketClient } from 'bybit-api'
import { createUniqueId, logger } from '../utils'
import { LivePosition } from '../types'

export class BybitClient {
  private restClient: RestClientV5
  private wsClient: WebsocketClient

  public position: LivePosition | null = null
  public closedPositions: LivePosition[] = []
  public lastTicker: Ticker | null = null
  symbol: string | null = null

  constructor(apiKey: string, apiSecret: string) {
    this.restClient = new RestClientV5({
      key: apiKey,
      secret: apiSecret,
    })

    this.wsClient = new WebsocketClient(
      {
        key: apiKey,
        secret: apiSecret,
        market: 'v5',
      },
      logger
    )

    this.wsClient.on('update', this.onUpdate.bind(this))
    this.wsClient.on('response', this.onResponse.bind(this))
    this.wsClient.on('error', (error) => {
      logger.error('[ws err]', error)
    })
  }

  setSymbol(symbol: string) {
    this.symbol = symbol
  }

  private async onUpdate(event: unknown) {
    if (isPositionUpdateEvent(event)) {
      if (!this.symbol) throw new Error('[bybit client] Symbol not set')
      const data = event.data.find((d) => d.symbol === this.symbol)
      if (!data) return
      const ctSize = +data.size
      const posId = data.createdTime + data.symbol

      if (this.position && this.position.posId !== posId) return

      if (ctSize === 0) {
        logger.warn('position closed', data)
        if (this.position) this.closedPositions.push(this.position)
        this.position = null
        return
      }

      const realizedPnlUsd = +data.curRealisedPnl
      const uplUsd = data.unrealisedPnl
      const margin = data.positionIM

      this.position = {
        uplUsd,
        profit: (uplUsd / margin).toString(),
        posId: data.createdTime + data.symbol,
        liqPrice: +data.liqPrice,
        avgEntryPrice: +data.entryPrice,
        margin,
        lever: data.leverage,
        creationTime: data.createdTime,
        ctSize,
        type: data.side === 'Buy' ? 'long' : 'short',
        posSide: 'net',
        realizedPnlUsd,
        fee: 0,
      }
    } else if (isTickerUpdateEvent(event)) {
      if (event.data.lastPrice) {
        this.lastTicker = event.data
      }
    } else if (isOrderUpdateEvent(event)) {
      logger.debug('ws order event', event)
    } else logger.debug('ws unknown', event)
  }

  private async onResponse(response: unknown) {
    logger.debug(response)
  }

  subscribeToTicker(symbol: string) {
    this.wsClient.subscribeV5([`tickers.${symbol}`], 'linear')
  }

  subscribeToOrder() {
    this.wsClient.subscribeV5('order', 'linear')
  }

  subscribeToPosition() {
    this.wsClient.subscribeV5('position', 'linear')
  }

  subscribeToExecution() {
    this.wsClient.subscribeV5('execution', 'linear')
  }

  async loadLivePosition(symbol: string) {
    const pos = await this.getPositionInfo(symbol)
    if (!pos) return

    const uplUsd = pos.unrealisedPnl
    const margin = pos.positionIM!
    const data = pos
    const ctSize = +data.size
    const realizedPnlUsd = +data.cumRealisedPnl

    this.position = {
      uplUsd,
      profit: (+uplUsd / +margin).toString(),
      posId: data.createdTime + data.symbol,
      liqPrice: +data.liqPrice,
      avgEntryPrice: +data.avgPrice,
      margin,
      lever: data.leverage!,
      creationTime: data.createdTime,
      ctSize,
      type: data.side === 'Buy' ? 'long' : 'short',
      posSide: 'net',
      realizedPnlUsd,
      fee: 0,
    }
  }

  async placeMarketOrder(
    symbol: string,
    side: 'Buy' | 'Sell',
    qty: number,
    clOrdId: string = 'hb-' + createUniqueId(10)
  ) {
    if (clOrdId.length > 36) throw new Error('clOrdId must be less than 36 characters')
    const response = await this.restClient.submitOrder({
      category: 'linear',
      symbol,
      orderType: 'Market',
      orderLinkId: clOrdId,
      qty: qty.toString(),
      side,
      positionIdx: 0, // hedge mode disabled
    })

    logger.debug(response)

    if (response.retCode !== 0) {
      throw new Error(`Failed to place order: ${response.retMsg}`)
    }
    return response.result
  }

  async getOrderDetails(orderLinkId: string) {
    const response = await this.restClient.getHistoricOrders({
      category: 'linear',
      orderLinkId,
    })

    return response.result.list[0]
  }

  private async getMaxLeverage(symbol: string) {
    const response = await this.restClient.getRiskLimit({
      symbol,
      category: 'linear',
    })

    return +response.result.list[0].maxLeverage
  }

  async setLeverage(symbol: string, leverage: number) {
    const maxLever = await this.getMaxLeverage(symbol)
    if (leverage > maxLever) {
      logger.debug(`Leverage ${leverage} is higher than max leverage ${maxLever}`)
      return
    }
    const response = await this.restClient.setLeverage({
      category: 'linear',
      symbol,
      buyLeverage: leverage.toString(),
      sellLeverage: leverage.toString(),
    })

    return response
  }

  async getPositionInfo(symbol: string) {
    const response = await this.restClient.getPositionInfo({
      category: 'linear',
      symbol,
    })
    const data = response.result.list
    if (data.length > 1) throw new Error('More than one position found')

    return response.result.list[0]
  }

  async getInstruments() {
    const response = await this.restClient.getInstrumentsInfo({
      category: 'linear',
    })

    return response.result.list
  }

  async getAccountBalance() {
    const { result } = await this.restClient.getWalletBalance({
      accountType: 'UNIFIED',
    })

    return result.list[0].totalEquity
  }
}

interface PositionUpdateEvent {
  topic: string
  data: any[]
}

interface Ticker {
  symbol: string
  tickDirection: string
  price24hPcnt: string
  lastPrice: string
  prevPrice24h: string
  highPrice24h: string
  lowPrice24h: string
  prevPrice1h: string
  markPrice: string
  indexPrice: string
  openInterest: string
  openInterestValue: string
  turnover24h: string
  volume24h: string
  nextFundingTime: string
  fundingRate: string
  bid1Price: string
  bid1Size: string
  ask1Price: string
  ask1Size: string
}

interface TickerUpdateEvent {
  topic: string
  type: string
  data: Ticker
  cs: number
  ts: number
}

const isPositionUpdateEvent = (event: any): event is PositionUpdateEvent => {
  return event.topic === 'position'
}

const isTickerUpdateEvent = (event: any): event is TickerUpdateEvent => {
  return event.topic.startsWith('tickers.')
}

interface OrderUpdateEvent {
  id: string
  topic: string
  creationTime: string
  data: {
    symbol: string
    orderId: string
    side: string
    orderType: string
    cancelType: string
    price: string
    qty: string
    orderIv: string
    timeInForce: string
    orderStatus: string
    orderLinkId: string
    lastPriceOnCreated: string
    reduceOnly: boolean
    leavesQty: string
    leavesValue: string
    cumExecQty: string
    cumExecValue: string
    avgPrice: string
    blockTradeId: string
    positionIdx: number
    cumExecFee: string
    createdTime: string
    updatedTime: string
    rejectReason: string
    stopOrderType: string
    tpslMode: string
    triggerPrice: string
    takeProfit: string
    stopLoss: string
  }[]
}

const isOrderUpdateEvent = (event: any): event is OrderUpdateEvent => {
  return event.topic === 'order'
}
