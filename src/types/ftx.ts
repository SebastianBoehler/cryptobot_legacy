export type Market = {
    name: string
    baseCurrency: null
    qouteCurrency: null
    quoteVolume24h: number
    change1h: number
    change24h: number
    changeBod: number
    highestLeverageFeeExempt: boolean
    minProvideSize: number
    type: 'future' | 'spot'
    futureType: 'perpetual' | string
    underlying: string
    enabled: boolean
    ask: number
    bid: number
    last: number
    postOnly: boolean
    price: number
    priceIncrement: number
    sizeIncrement: number
    restricted: boolean
    volumeUsd24h: number
    largeOrderThreshold: number
    isEtfMarket: boolean
}

export type HistoricalPrice = {
    startTime: string
    time: number
    open: number
    high: number
    low: number
    close: number
    volume: number
}

export type TickerUpdate = {
    channel: string
    market: string
    type: string
    data: {
        bid: number
        ask: number
        bidSize: number
        askSize: number
        last: number
        time: number
    }
}

export type SubscribeEvent = {
    type: 'subscribed' | 'unsubscribed'
    channel: string
    market?: string
}