import { RestClientV5, WebsocketClient } from 'bybit-api'
import { createUniqueId, logger } from '../utils'
import { LivePosition } from '../types'

export class BybitClient {
  private restClient: RestClientV5
  private wsClient: WebsocketClient

  public position: LivePosition | null = null
  public closedPositions: LivePosition[] = []
  public lastTicker: Ticker | null = null

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

    this.wsClient.subscribeV5(['order', 'position', 'execution'], 'linear')
  }

  private async onUpdate(event: unknown) {
    if (isPositionUpdateEvent(event)) {
      const data = event.data[0]
      const ctSize = +data.size

      const posId = data.createdTime + data.symbol
      if (this.position && this.position.posId !== posId) return

      if (ctSize === 0) {
        logger.debug('position closed', data)
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
    } else logger.debug('unknown', event)
  }

  private async onResponse(response: unknown) {
    logger.debug(response)
  }

  subscribeToTicker(symbol: string) {
    this.wsClient.subscribeV5([`tickers.${symbol}`], 'linear')
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

  async getOrderDetails(orderId: string) {
    const response = await this.restClient.getHistoricOrders({
      category: 'linear',
      orderId,
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

  async getInstruments() {
    const response = await this.restClient.getInstrumentsInfo({
      category: 'linear',
    })

    return response.result.list
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
