import { CloseOrder, ClosedPosition, Indicators, Order, Position } from 'cryptobot-types'
import { OrderResult } from 'okx-api'

export interface LivePosition extends Position {
  realizedPnlUSD: number
  posId: string
}

export interface IOrderHelper {
  leverage: number
  minSize: number
  position: Position | null
  price: number
  identifier: string | undefined
  lastPosition: ClosedPosition | null
  profitUSD: number

  setLeverage(leverage: number): void
  getContractInfo(): Promise<void>
  update(price: number, time: Date, indicators?: Indicators[]): void
  openOrder(type: 'long' | 'short', amountUSD: number, ordId?: string): Promise<Order | undefined>
  closeOrder(amountCts: number, ordId?: string): Promise<CloseOrder | undefined>
  convertUSDToContracts(price: number, amountUSD: number): number
  contractUsdValue(price: number): number
}

export interface ILiveOrderHelper extends Omit<IOrderHelper, 'position' | 'setLeverage' | 'closeOrder'> {
  position: LivePosition | null
  setLeverage(leverage: number, type: 'long' | 'short'): void
  closeOrder(amountCts: number, ordId?: string): Promise<ClosedPosition | OrderResult>
}
