import mysql from 'mysql';
import { HistoricalPrice } from '../types/ftx';
import { RowDataPacket } from '../types/mysql'

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

    async priceHistory(symbol: string, options: string = 'LIMIT 0, 2') {
        return new Promise<RowDataPacket[]>((resolve, reject) => {
            this.connnection.query(`SELECT * FROM ${symbol} ${options}`, (err, results) => {
                if (err) reject(err)
                else resolve(results)
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
}

export default sql_class