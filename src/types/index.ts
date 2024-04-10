import { OrderResultV5 } from 'bybit-api'
import { CloseOrder, ClosedPosition, Indicators, Order, Position } from 'cryptobot-types'
import { OrderResult, PositionSide } from 'okx-api'

export interface IOrderHelperPos extends Position {
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

  setLeverage(leverage: number, _type: 'long' | 'short', availCapital: number): void
  getContractInfo(): Promise<void>
  update(price: number, time: Date, indicators?: Indicators[]): void
  openOrder(type: 'long' | 'short', amountUSD: number, ordId?: string): Promise<Order | undefined>
  closeOrder(amountCts: number, ordId?: string): Promise<CloseOrder | undefined>
  convertUSDToContracts(price: number, amountUSD: number): number
  contractUsdValue(price: number): number
}

export interface ILiveOrderHelper extends Omit<IOrderHelper, 'position' | 'setLeverage' | 'closeOrder' | 'update'> {
  position: IOrderHelperPos | null
  accHash: string
  setLeverage(leverage: number, type: 'long' | 'short', availCapital: number): Promise<void>
  update(price: number, time: Date, indicators?: Indicators[]): Promise<IOrderHelperPos | undefined>
  closeOrder(amountCts: number, ordId?: string): Promise<ClosedPosition | OrderResult | OrderResultV5>
}

export interface LivePosition {
  uplUsd: string
  profit: string
  //tradeId: string
  posId: string
  liqPrice: number
  avgEntryPrice: number
  //closeOrderAlgo: string[]
  margin: string
  lever: string
  creationTime: string
  ctSize: number
  fee: number
  realizedPnlUsd: number
  type: 'long' | 'short'
  posSide: PositionSide
  gotLiquidated?: boolean
}
