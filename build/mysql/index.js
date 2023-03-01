"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mysql_1 = __importDefault(require("mysql"));
const config_1 = __importDefault(require("../config/config"));
class sql_class {
    pool;
    constructor(database) {
        this.pool = mysql_1.default.createPool({
            connectionLimit: 30,
            host: config_1.default.SQL_HOST,
            user: config_1.default.SQL_USER,
            password: config_1.default.SQL_PASSWORD,
            port: +(config_1.default.SQL_PORT || 3306),
            database: database
        });
    }
    async createTable(table, columns) {
        return new Promise((resolve, reject) => {
            this.pool.query(`CREATE TABLE ${table.replace('-', '')} (${columns.join(',')})`, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    async createIndex(table, column) {
        return new Promise((resolve, reject) => {
            this.pool.query(`CREATE INDEX ${column}_index ON ${table.replace('-', '')} (${column})`, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    async deleteRows(table, options = '') {
        return new Promise((resolve, reject) => {
            this.pool.query(`DELETE FROM ${table.replace('-', '')} ${options}`, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    async changeColumnType(table, column, type) {
        return new Promise((resolve, reject) => {
            this.pool.query(`ALTER TABLE ${table.replace('-', '')} CHANGE COLUMN ${column} ${column} ${type}`, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    async getTablesInDatabase(database) {
        return new Promise((resolve, reject) => {
            this.pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = '${database}'`, (err, results) => {
                if (err)
                    reject(err);
                else
                    resolve(results.map((item) => item.TABLE_NAME));
            });
        });
    }
    async getPriceHistory(symbol, options = '', limit, fields = 'volume, time, open, close, high, low') {
        return new Promise((resolve, reject) => {
            this.pool.query(`SELECT ${fields} FROM (SELECT * FROM ${symbol.replace('-', '')} ${options} ORDER BY id DESC ${limit ? `LIMIT ${limit}` : ''}) sub ORDER BY id ASC`, (err, results) => {
                if (err)
                    reject(err);
                else
                    resolve(results.map((item) => {
                        return {
                            volume: +item.volume,
                            time: +item.time,
                            open: +item.open,
                            close: +item.close,
                            high: +item.high,
                            low: +item.low,
                        };
                    }));
            });
        });
    }
    async getLastPriceTimestamp(symbol) {
        return new Promise((resolve, reject) => {
            this.pool.query(`SELECT time FROM ${symbol.replace('-', '')} ORDER BY time DESC LIMIT 1`, (err, results) => {
                if (err)
                    reject(err);
                else if (results[0])
                    resolve(+results[0].time);
                else
                    resolve(0);
            });
        });
    }
    async pushNewPriceData(symbol, data) {
        return new Promise((resolve, reject) => {
            this.pool.query(`INSERT INTO ${symbol.replace('-', '')} (time, open, high, low, close, price, volume) VALUES (${data.time}, ${data.open}, ${data.high}, ${data.low}, ${data.close}, ${data.close}, ${data.volume})`, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    async getPriceHistoryTimes(symbol, options = '') {
        return new Promise((resolve, reject) => {
            this.pool.query(`SELECT time FROM ${symbol.replace('-', '')} ${options}`, (err, results) => {
                if (err)
                    reject(err);
                else
                    resolve(results.map((item) => +item.time));
            });
        });
    }
    async writeTransaction(data) {
        return new Promise((resolve, reject) => {
            this.pool.query(`INSERT INTO backtester (rule,symbol,time,orderID,side,profit,data) VALUES ('${data.rule}','${data.symbol}','${data.timestamp}','${data.orderId}','${data.type}',${data.netProfitPercentage || null},'${JSON.stringify(data)}')`, async (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    async deleteTransaction(orderId) {
        return new Promise((resolve, reject) => {
            this.pool.query(`DELETE FROM backtester WHERE orderId = '${orderId}'`, async (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    async deleteTable(table) {
        return new Promise((resolve, reject) => {
            this.pool.query(`DROP TABLE ${table.replace('-', '')}`, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    async emptyTable(table) {
        return new Promise((resolve, reject) => {
            this.pool.query(`TRUNCATE TABLE ${table.replace('-', '')}`, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    async loadTransactions(table, limit, id) {
        return new Promise((resolve, reject) => {
            let string = `SELECT data, id FROM ${table.replace('-', '')}`;
            if (id)
                string += ` WHERE id > ${id}`;
            if (limit)
                string += ` LIMIT ${limit}`;
            this.pool.query(string, (err, result) => {
                if (err)
                    reject(err);
                else
                    resolve(result.map(item => {
                        const data = JSON.parse(item.data);
                        data.db_id = item.id;
                        return data;
                    }));
            });
        });
    }
}
exports.default = sql_class;
//# sourceMappingURL=index.js.map