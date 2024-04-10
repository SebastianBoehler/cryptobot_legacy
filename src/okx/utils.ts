import {
  DefaultLogger,
  WebsocketClient,
  WsDataEvent,
  WsEvent,
  RestClient,
  InstrumentType,
  PositionSide,
  MarginMode,
  AccountConfiguration,
} from 'okx-api'
import { createUniqueId, logger } from '../utils'
import {
  BalanceAndPositionUpdateEvent,
  OrderUpdateEvent,
  PositionUpdateEvent,
  TickerUpdateData,
  TickerUpdateEvent,
} from 'cryptobot-types'
import { LivePosition } from '../types'

type ModifiedAccountConfiguration = Omit<AccountConfiguration, 'posMode'> & {
  posMode: 'net_mode' | 'long_short_mode'
}

class OkxClient {
  private wsClient: WebsocketClient
  private restClient: RestClient
  private accConfig: ModifiedAccountConfiguration | null = null
  public lastTicker: TickerUpdateData | null = null
  public subscriptions: { channel: string; instId: string }[] = []
  public position: LivePosition | null = null
  public closedPositions: LivePosition[] = []

  constructor(credentials: { apiKey: string; apiSecret: string; apiPass: string }) {
    this.restClient = new RestClient(credentials)

    this.wsClient = new WebsocketClient(
      {
        accounts: [credentials],
        //pingInterval: 1000 * 10,
      },
      {
        ...DefaultLogger,
        ...logger,
      }
    )

    this.wsClient.on('update', this.onUpdate.bind(this))
    this.wsClient.on('response', this.onResponse.bind(this))
    this.wsClient.on('error', (error) => {
      logger.error('[OKX ws err]', error)
    })
  }

  private async onUpdate(event: TickerUpdateEvent | WsDataEvent) {
    if (isTickerUpdateEvent(event)) {
      this.lastTicker = event.data[0]
    } else if (isPositionUpdateEvent(event)) {
      //no extra event, values just set to ""
      if (event.data.length > 0) {
        //logger.debug('[OKX] position update', event.data[0].upl)
        const data = event.data[0]

        if (+data.pos < 1 && this.position) {
          this.closedPositions.push(this.position)
          this.position = null
          return
        }
        if (+data.pos < 1) return

        //@ts-ignore
        const fee = +data.fee
        //@ts-ignore
        const fudingFee = +data.fundingFee
        //@ts-ignore
        const realizedPnl = +data.realizedPnl

        this.position = {
          uplUsd: data.upl,
          profit: data.uplRatio,
          //tradeId: data.tradeId,
          posId: data.posId,
          liqPrice: +data.liqPx,
          avgEntryPrice: +data.avgPx,
          //closeOrderAlgo: data.closeOrderAlgo,
          margin: data.margin,
          lever: data.lever,
          creationTime: data.cTime,
          ctSize: +data.pos,
          type: +data.pos > 0 ? 'long' : 'short',
          posSide: data.posSide as PositionSide,
          realizedPnlUsd: realizedPnl, //l + fudingFee,
          fee: fee + fudingFee,
        }
      }
    } else if (isOrderUpdateEvent(event)) {
      // order placed / filled / cancelled
      const data = event.data[0]
      logger.debug('[OKX] order update', data.state, data.clOrdId, data.ordId)
    } else if (isBalanceAndPositionUpdateEvent(event)) {
      const data = event.data[0]
      const posId = data.posData.posId
      if (posId === this.position?.posId) {
        logger.warn('[OKX] position update', data.eventType)
        if (data.eventType === 'liquidation') {
          this.position.gotLiquidated = true
        }
      }

      const closedPosIndex = this.closedPositions.findIndex((p) => p.posId === posId)
      if (closedPosIndex > 0) {
        logger.warn('[OKX] closed position update', data.eventType)
        if (data.eventType === 'liquidation') {
          this.closedPositions[closedPosIndex].gotLiquidated = true
        }
      }
    } else {
      logger.info('[OKX] unhandled event', event)
    }
  }

  //subscribe / unsubscribe events
  private async onResponse({ event, arg }: WsEvent) {
    if (event === 'unsubscribe') {
      logger.debug('[OKX] Unsubscribed', arg)
      this.lastTicker = null
      this.subscriptions = this.subscriptions.filter((sub) => sub.instId !== arg.instId && sub.channel !== arg.channel)
    }
    if (event === 'subscribe') {
      logger.debug('[OKX] Subscribed', arg)
      this.subscriptions.push(arg)
    }
  }

  async subscribeToPriceData(symbol: string) {
    this.wsClient.subscribe({
      channel: 'tickers',
      instId: symbol,
    })
  }

  async unsubscribeFromPriceData(symbol: string) {
    this.wsClient.unsubscribe({
      channel: 'tickers',
      instId: symbol,
    })
  }

  async subscribeToPositionData(symbol: string, instType: InstrumentType = 'SWAP') {
    this.wsClient.subscribe({
      channel: 'positions',
      instType,
      instId: symbol,
    })
  }

  async subsribeToOrderData(symbol: string, instType: InstrumentType = 'SWAP') {
    this.wsClient.subscribe({
      channel: 'orders',
      instType,
      instId: symbol,
    })
  }

  async subscribeToBalanceAndPositionsData(symbol: string, instType: InstrumentType = 'SWAP') {
    this.wsClient.subscribe({
      channel: 'balance_and_position',
    })
  }

  async reduceMargin(instId: string, posSide: PositionSide, amt: string) {
    const resp = await this.restClient.changePositionMargin({
      instId,
      posSide,
      type: 'reduce',
      amt,
    })
    return resp
  }

  async getAdjustLeverageInfo(
    instType: InstrumentType,
    mgnMode: MarginMode,
    lever: string,
    posSide: PositionSide,
    instId: string
  ) {
    const resp = await this.restClient.getLeverageEstimatedInfo({
      instType,
      instId,
      mgnMode,
      lever,
      posSide,
    })

    return resp[0]
  }

  async getAccountBalance() {
    const resp = await this.restClient.getBalance()
    return resp[0].totalEq
  }

  async placeMarketOrder(
    symbol: string,
    side: 'buy' | 'sell',
    size: number | string,
    clOrdId: string = createUniqueId(32),
    reduceOnly: boolean = false,
    posSide?: PositionSide,
    takeProfit?: {
      tpTriggerPx: string
      tpOrdPx: string
    },
    stopLoss?: {
      slTriggerPx: string
      slOrdPx: string
    }
  ) {
    if (!this.accConfig) await this.getAccountConfiguration()
    if (this.accConfig!.posMode === 'net_mode') {
      posSide = 'net'
    }

    if (clOrdId.length > 32) throw new Error(`clOrdId too long: ${side} ${clOrdId}`)
    const resp = await this.restClient
      .submitOrder({
        clOrdId: clOrdId.replaceAll('-', ''),
        instId: symbol,
        ordType: 'market',
        side,
        tag: 'hb-capital-' + createUniqueId(10),
        posSide,
        sz: String(size),
        tdMode: 'isolated',
        reduceOnly,
        ...takeProfit,
        ...stopLoss,
      })
      .catch((err) => {
        logger.error('Error placing order', err)
        throw err
      })
    logger.debug('Order placed', resp)
    return resp[0]
  }

  /**
   * Immediate or cancel order, takes the best price available
   */
  async placeIOCOrder(
    symbol: string,
    side: 'buy' | 'sell',
    size: number | string,
    clOrdId: string = createUniqueId(32),
    price: string,
    takeProfit?: {
      tpTriggerPx: string
      tpOrdPx: string
    },
    stopLoss?: {
      slTriggerPx: string
      slOrdPx: string
    }
  ) {
    if (!price) throw new Error('No price data available')
    const resp = await this.restClient.submitOrder({
      clOrdId: clOrdId.replaceAll('-', ''),
      instId: symbol,
      px: price,
      ordType: 'ioc', //immediate or cancel
      side,
      sz: String(size),
      tdMode: 'isolated',
      ...takeProfit,
      ...stopLoss,
    })
    return {
      ...resp[0],
      clOrdId,
    }
  }

  async getPositions(instId?: string, posId?: string, instType?: InstrumentType) {
    const resp = await this.restClient.getPositions({
      instId,
      posId,
      instType,
    })
    return resp
  }

  async closePosition(symbol: string, clOrdId: string = createUniqueId(32)) {
    const resp = await this.restClient.closePositions({
      clOrdId,
      instId: symbol,
      mgnMode: 'isolated',
      autoCxl: true,
    })
    return resp
  }

  async getOrderDetails(clOrdId: string, symbol: string) {
    const resp = await this.restClient.getOrderDetails({
      instId: symbol,
      clOrdId,
    })
    return resp[0]
  }

  async getOrderList(instType: InstrumentType, instId?: string) {
    const resp = await this.restClient.getOrderList({
      instType,
      instId,
    })
    return resp
  }

  async amendOrder(clOrdId: string, instId: string, newPx: number) {
    const resp = await this.restClient.amendOrder({
      instId,
      clOrdId,
      newPx: String(newPx),
    })
    return resp
  }

  async setLeverage(
    symbol: string,
    leverage: number,
    mgnMode: 'cross' | 'isolated' = 'isolated',
    posSide?: 'long' | 'short'
  ) {
    if (!this.accConfig) await this.getAccountConfiguration()
    if (this.accConfig!.posMode === 'net_mode') {
      posSide = undefined
    }
    logger.warn(`Setting leverage to ${leverage} for ${symbol} and side ${posSide}`)
    const resp = await this.restClient.setLeverage({
      instId: symbol,
      mgnMode,
      posSide,
      lever: String(leverage),
    })
    return resp
  }

  async getTickers(instType: InstrumentType = 'SWAP') {
    const resp = await this.restClient.getTickers(instType)
    return resp
  }

  async getInstruments(instType: InstrumentType = 'SWAP') {
    const resp = await this.restClient.getInstruments(instType)
    return resp
  }

  async getAccountConfiguration() {
    if (!this.accConfig) {
      const resp = await this.restClient.getAccountConfiguration()
      this.accConfig = resp[0] as ModifiedAccountConfiguration
    }
    return this.accConfig
  }

  async getPositionHistory(posId: string, instId?: string, instType: InstrumentType = 'SWAP') {
    const resp = await this.restClient.getPositionsHistory({
      instType,
      instId,
      posId,
    })
    return resp
  }
}

export { OkxClient }

//TYPE GUARDS
export const isTickerUpdateEvent = (event: WsDataEvent): event is TickerUpdateEvent => {
  return event.arg.channel === 'tickers'
}

export const isPositionUpdateEvent = (event: WsDataEvent): event is PositionUpdateEvent => {
  return event.arg.channel === 'positions'
}

export const isOrderUpdateEvent = (event: WsDataEvent): event is OrderUpdateEvent => {
  return event.arg.channel === 'orders'
}

export const isBalanceAndPositionUpdateEvent = (event: WsDataEvent): event is BalanceAndPositionUpdateEvent => {
  return event.arg.channel === 'balance_and_position'
}
