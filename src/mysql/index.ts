import mysql from 'mysql';
import { HistoricalPrice } from '../types/ftx';
import { RowDataPacketPrice, RowDataPacketPriceParsed, RowDataPacketTransactionRaw} from '../types/mysql'

import * as dotenv from 'dotenv';
import { orderObject } from '../types/trading';

const path = process.env.NODE_ENV ? process.env.NODE_ENV.split(' ').join('') : 'prod'
dotenv.config({
    path: path + '.env'
});

class sql_class {
    pool: mysql.Pool;

    constructor(database: string) {
        this.pool = mysql.createPool({
            connectionLimit: 35,
            queueLimit: 100,
            host: process.env.SQL_HOST,
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            port: +(process.env.SQL_PORT || 3306),
            database: database
        })
    }

    async createTable(table: string, columns: string[]) {
        return new Promise<void>((resolve, reject) => {
            this.pool.query(`CREATE TABLE ${table.replace('-', '')} (${columns.join(',')})`, (err) => {
                if (err) reject(err)
                else resolve()
            })
        })
    }

    async getPriceHistory(symbol: string, options: string = '', limit?: number, fields: string = 'volume, time, open, close, high, low') {
        return new Promise<RowDataPacketPriceParsed[]>((resolve, reject) => {
            this.pool.query(`SELECT ${fields} FROM (SELECT * FROM ${symbol.replace('-', '')} ${options} ORDER BY id DESC ${limit ? `LIMIT ${limit}` : ''}) sub ORDER BY id ASC`, (err, results) => {
                if (err) reject(err)
                else resolve(results.map((item: RowDataPacketPrice) => {
                    return {
                        volume: +item.volume,
                        time: +item.time,
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
            this.pool.query(`SELECT time FROM ${symbol.replace('-', '')} ORDER BY time DESC LIMIT 1`, (err, results) => {
                if (err) reject(err)
                else if (results[0]) resolve(+results[0].time)
                else resolve(0)
            })
        })
    }

    async pushNewPriceData(symbol: string, data: HistoricalPrice) {
        return new Promise<void>((resolve, reject) => {
            this.pool.query(`INSERT INTO ${symbol.replace('-', '')} (time, open, high, low, close, price, volume) VALUES (${data.time}, ${data.open}, ${data.high}, ${data.low}, ${data.close}, ${data.close}, ${data.volume})`, (err) => {
                if (err) reject(err)
                else resolve()
            })
        })
    }

    async getPriceHistoryTimes(symbol: string, options: string = '') {
        return new Promise<number[]>((resolve, reject) => {
            this.pool.query(`SELECT time FROM ${symbol.replace('-', '')} ${options}`, (err, results) => {
                if (err) reject(err)
                else resolve(results.map((item: RowDataPacketPrice) => +item.time))
            })
        })
    }

    async writeTransaction(data: orderObject) {
        return new Promise<void>((resolve, reject) => {
            this.pool.query(`INSERT INTO backtester (rule,symbol,time,orderID,side,profit,data) VALUES ('${data.rule}','${data.symbol}','${data.timestamp}','${data.orderId}','${data.type}',${data.netProfitPercentage || null},'${JSON.stringify(data)}')`, (err) => {
                if (err) reject(err)
                else resolve()
            })
        })
    }

    async deleteTransaction(orderId: string) {
        return new Promise<void>((resolve, reject) => {
            this.pool.query(`DELETE FROM backtester WHERE orderId = '${orderId}'`, (err) => {
                if (err) reject(err)
                else resolve()
            })
        })
    }

    async deleteTable(table: string) {
        return new Promise<void>((resolve, reject) => {
            this.pool.query(`DROP TABLE ${table.replace('-', '')}`, (err) => {
                if (err) reject(err)
                else resolve()
            })
        })
    }

    async emptyTable(table: string) {
        return new Promise<void>((resolve, reject) => {
            this.pool.query(`TRUNCATE TABLE ${table.replace('-', '')}`, (err) => {
                if (err) reject(err)
                else resolve()
            })
        })
    }

    async loadTransactions(table: string) {
        return new Promise<orderObject[]>((resolve, reject) => {
            this.pool.query(`SELECT data FROM ${table.replace('-', '')}`, (err: any, result: RowDataPacketTransactionRaw[]) => {
                if (err) reject(err)
                else resolve(result.map(item => JSON.parse(item.data)))
            })
        })
    }
}

export default sql_class