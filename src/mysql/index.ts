import mysql from 'mysql';
import { HistoricalPrice } from '../types/ftx';
import { RowDataPacketPrice, RowDataPacketPriceParsed } from '../types/mysql'

import * as dotenv from 'dotenv';
import { orderObject } from '../types/trading';
dotenv.config({
    path: `${process.env.NODE_ENV?.split(' ').join('')}.env`
});

class sql_class {
    connnection: mysql.Connection;

    constructor(database: string) {
        this.connnection = mysql.createConnection({
            host: process.env.SQL_HOST,
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            database: database
        })
        this.connnection.connect()
    }

    async getPriceHistory(symbol: string, options: string = '', limit?: number) {
        return new Promise<RowDataPacketPriceParsed[]>((resolve, reject) => {
            this.connnection.query(`SELECT * FROM (SELECT * FROM ${symbol.replace('-', '')} ${options} ORDER BY id DESC ${limit ? `LIMIT ${limit}` : ''}) sub ORDER BY id ASC`, (err, results) => {
                if (err) reject(err)
                else resolve(results.map((item: RowDataPacketPrice) => {
                    return {
                        id: +item.id,
                        price: +item.price,
                        volume: +item.volume,
                        time: +item.time,
                        bid: +item.bid,
                        ask: +item.ask,
                        open: +item.open,
                        close: +item.close,
                        high: +item.high,
                        low: +item.low,
                    }
                }))
            })
        })
    }

    async getLastPriceTimestamp(symbol: string) {
        return new Promise<number>((resolve, reject) => {
            this.connnection.query(`SELECT time FROM ${symbol.replace('-', '')} ORDER BY time DESC LIMIT 1`, (err, results) => {
                if (err) reject(err)
                else resolve(+results[0].time)
            })
        })
    }

    async pushNewPriceData(symbol: string, data: HistoricalPrice) {
        return new Promise<void>((resolve, reject) => {
            this.connnection.query(`INSERT INTO ${symbol.replace('-', '')} (time, open, high, low, close, price, volume) VALUES (${data.time}, ${data.open}, ${data.high}, ${data.low}, ${data.close}, ${data.close}, ${data.volume})`, (err) => {
                if (err) reject(err)
                else resolve()
            })
        })
    }

    async getPriceHistoryTimes(symbol: string, options: string = '') {
        return new Promise<number[]>((resolve, reject) => {
            this.connnection.query(`SELECT time FROM ${symbol.replace('-', '')} ${options}`, (err, results) => {
                if (err) reject(err)
                else resolve(results.map((item: RowDataPacketPrice) => +item.time))
            })
        })
    }

    async writeTransaction(data: orderObject) {
        return new Promise<void>((resolve, reject) => {
            this.connnection.query(`INSERT INTO transactions (price, timestamp, type, action, symbol, invest, size, fee, platform, avgPrice, status, index) VALUES (${data.price}, ${data.timestamp}, '${data.type}', '${data.action}', '${data.symbol}', ${data.invest}, ${data.size}, ${data.fee}, '${data.platform}', ${data.avgPrice}, '${data.status}', ${data.index})`, (err) => {
                if (err) reject(err)
                else resolve()
            })
        })
    }
}

export default sql_class