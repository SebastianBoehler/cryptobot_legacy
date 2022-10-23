import mysql from 'mysql';
import { HistoricalPrice } from '../types/ftx';
import { RowDataPacketPrice, RowDataPacketPriceParsed, RowDataPacketTableRaw, RowDataPacketTransactionRaw} from '../types/mysql'
import config from '../config/config'
import { orderObject } from '../types/trading';

class sql_class {
    pool: mysql.Pool;

    constructor(database: string) {
        this.pool = mysql.createPool({
            connectionLimit: 30,
            host: config.SQL_HOST,
            user: config.SQL_USER,
            password: config.SQL_PASSWORD,
            port: +(config.SQL_PORT || 3306),
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

    async createIndex(table: string, column: string) {
        return new Promise<void>((resolve, reject) => {
            this.pool.query(`CREATE INDEX ${column}_index ON ${table.replace('-', '')} (${column})`, (err) => {
                if (err) reject(err)
                else resolve()
            })
        })
    }

    async deleteRows(table: string, options: string = '') {
        return new Promise<void>((resolve, reject) => {
            this.pool.query(`DELETE FROM ${table.replace('-', '')} ${options}`, (err) => {
                if (err) reject(err)
                else resolve()
            })
        })
    }

    async changeColumnType(table: string, column: string, type: string) {
        return new Promise<void>((resolve, reject) => {
            this.pool.query(`ALTER TABLE ${table.replace('-', '')} CHANGE COLUMN ${column} ${column} ${type}`, (err) => {
                if (err) reject(err)
                else resolve()
            })
        })
    }

    async getTablesInDatabase(database: string) {
        return new Promise<string[]>((resolve, reject) => {
            this.pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = '${database}'`, (err, results) => {
                if (err) reject(err)
                else resolve(results.map((item: RowDataPacketTableRaw) => item.TABLE_NAME))
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

    async loadTransactions(table: string, limit?: number, id?: number) {
        return new Promise<orderObject[]>((resolve, reject) => {
            let string = `SELECT data FROM ${table.replace('-', '')}`

            if (id) string += ` WHERE id > ${id}`
            if (limit) string += ` LIMIT ${limit}`
            
            this.pool.query(string, (err: any, result: RowDataPacketTransactionRaw[]) => {
                if (err) reject(err)
                else resolve(result.map(item => JSON.parse(item.data)))
            })
        })
    }
}

export default sql_class