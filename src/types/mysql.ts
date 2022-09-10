import { orderObject } from "./trading"

export type RowDataPacketPrice = {
    id: number
    price: string
    volume: string
    time: string
    bid: string
    ask: string
    open: string
    close: string
    high: string
    low: string
}

export type RowDataPacketPriceParsed = {
    id?: number
    price?: number
    volume: number
    time: number
    bid?: number
    ask?: number
    open: number
    close: number
    high: number
    low: number
}

export type RowDataPacketTransactionRaw = {
    id?: number
    rule: string
    symbol: string
    orderId: string
    time: number
    side: string
    profit: number
    data: string
}

export type RowDataPacketTransactionParsed = {
    id?: number
    rule: string
    symbol: string
    orderId: string
    time: number
    side: string
    profit: number
    data: orderObject
}