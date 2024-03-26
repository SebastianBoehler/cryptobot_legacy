import { RestClientV5, WebsocketClient } from 'bybit-api'
import { createUniqueId, logger } from '../utils'

export class BybitClient {
  private restClient: RestClientV5
  private wsClient: WebsocketClient

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

    this.wsClient.subscribeV5('position', 'linear')
    this.wsClient.subscribeV5('execution', 'linear')
    this.wsClient.subscribeV5(['order', 'wallet', 'greeks'], 'linear')
  }

  private async onUpdate(event: unknown) {
    logger.debug(event)
  }

  private async onResponse(response: unknown) {
    logger.debug(response)
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
}
