
export type Rule = {
    'Long Entry': boolean[][]
    'Long Exit': boolean[][]
    'Short Entry': boolean[][]
    'Short Exit': boolean[][]
}

export type OrderTypes = 'Long Entry' | 'Long Exit' | 'Short Entry' | 'Short Exit'

export type orderObject = {
    price: number
    timestamp: number
    type: string
    action: string,
    symbol: string
    invest: number
    netInvest: number
    size: number
    fee: number
    platform: 'ftx' | 'binance' | 'coinbase'
    avgPrice: number
    status: 'DEMO' | 'live',
    index: number | undefined
    orderId: string
    entryId?: string
    feeSum?: number
    netProfit?: number
    netProfitPercentage?: number
    priceChange?: number
    rule?: string
    holdDuration?: number
    details?: {[key: string]: number} 
    entryDetails?: {[key: string]: number}
    high?: number
    low?: number
}