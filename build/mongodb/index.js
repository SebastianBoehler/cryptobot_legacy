"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const date_fns_1 = require("date-fns");
const mongodb_1 = require("mongodb");
const config_1 = __importDefault(require("../config/config"));
const utils_1 = require("../utils");
const utils_2 = require("./utils");
const client = new mongodb_1.MongoClient(config_1.default.MONGO_URL);
class mongo {
    db;
    timeKey;
    constructor(db) {
        this.db = db;
        this.timeKey = (0, utils_2.getTimeKey)(db);
    }
    async connect() {
        await client.connect();
        console.log(`connected to mongodb`);
    }
    async write(data, collectionName, database) {
        const db = client.db(database || this.db);
        const collection = db.collection(collectionName);
        await collection.insertOne(data);
    }
    async existingCollections(database) {
        const db = client.db(database || this.db);
        const collections = await db.listCollections().toArray();
        return collections.map((collection) => collection.name);
    }
    async listDatabases() {
        const databases = await client.db().admin().listDatabases();
        return databases;
    }
    async createUniqueIndex(collectionName, key, database) {
        const db = client.db(database || this.db);
        const collection = db.collection(collectionName);
        await collection.createIndex({ [key]: 1 }, { unique: true });
    }
    async writeMany(collectionName, data) {
        const db = client.db(this.db);
        const collection = db.collection(collectionName);
        await collection.insertMany(data);
    }
    async read(key, value, collectionName) {
        const db = client.db(this.db);
        const collection = db.collection(collectionName);
        const result = await collection.findOne({ [key]: value });
        return result;
    }
    async readLastCandle(collectionName, timeKey) {
        const db = client.db(this.db);
        const collection = db.collection(collectionName);
        const result = await collection
            .find()
            .sort({ [timeKey]: -1 })
            .limit(1)
            .toArray();
        return result[0];
    }
    async getStartAndEndDates(database, collectionName, timeKey) {
        const db = client.db(database);
        const collection = db.collection(collectionName);
        const [startResult, endResult] = await Promise.all([
            collection
                .find()
                .sort({ [timeKey]: 1 })
                .limit(1)
                .toArray(),
            collection
                .find()
                .sort({ [timeKey]: -1 })
                .limit(1)
                .toArray(),
        ]);
        if (!startResult.length || !endResult.length) {
            utils_1.logger.warn(`No data for ${collectionName} in ${database}`);
            return;
        }
        const start = startResult[0][timeKey];
        const end = endResult[0][timeKey];
        return { start, end };
    }
    async getCount(collectionName, database) {
        const db = client.db(database || this.db);
        const collection = db.collection(collectionName);
        const count = await collection.countDocuments();
        return count;
    }
    async generateCandle(granularity, timestamp, symbol) {
        const pipeline = [
            {
                $match: {
                    [this.timeKey]: {
                        $gte: (0, date_fns_1.subMinutes)(timestamp, granularity),
                        $lt: new Date(timestamp),
                    },
                },
            },
            {
                $group: {
                    _id: null,
                    open: { $first: "$open" },
                    high: { $max: "$high" },
                    low: { $min: "$low" },
                    close: { $last: "$close" },
                    volume: {
                        $sum: {
                            $convert: {
                                input: "$volume",
                                to: "double",
                            },
                        },
                    },
                },
            },
        ];
        const db = client.db(this.db);
        const collection = db.collection(symbol);
        const result = await collection.aggregate(pipeline);
        const data = await result.toArray();
        if (!data.length) {
            utils_1.logger.warn(`No data for ${symbol} at ${timestamp} in ${this.db}`);
            return;
        }
        return {
            open: +data[0].open,
            high: +data[0].high,
            low: +data[0].low,
            close: +data[0].close,
            volume: +data[0].volume,
        };
    }
    async getTimeAndClose(database, symbol, timeKey) {
        const values = [];
        const limit = 1000;
        const db = client.db(database);
        const collection = db.collection(symbol);
        while (true) {
            const lastTimestamp = values[values.length - 1]
                ? values[values.length - 1][timeKey]
                : new Date(0);
            const result = await collection
                .find({
                [timeKey]: {
                    $gt: lastTimestamp,
                },
            })
                .project({ [timeKey]: 1, close: 1 })
                .sort({ [timeKey]: 1 })
                .limit(limit)
                .toArray();
            if (result.length < limit)
                break;
            values.push(...result);
        }
        return values;
    }
    async getEntryByTimestamp(database, symbol, timeKey, timestamp) {
        const db = client.db(database);
        const collection = db.collection(symbol);
        const result = await collection
            .find({
            [timeKey]: {
                $lt: new Date(timestamp),
            },
        })
            .sort({ [timeKey]: -1 })
            .limit(1)
            .toArray();
        if (!result.length) {
            //logger.warn(`No data for ${symbol} at ${timestamp} in ${database}`);
            return;
        }
        return {
            open: result[0].open,
            high: result[0].high,
            low: result[0].low,
            close: result[0].close,
            volume: result[0].volume,
            timestamp: result[0][timeKey],
        };
    }
    async saveBacktest(result) {
        const db = client.db("backtests");
        const collection = db.collection(result.exchange);
        await collection.insertOne(result);
    }
    async getBacktests(exchange, options) {
        const db = client.db("backtests");
        const collection = db.collection(exchange);
        const query = {};
        if (options?.minProfit !== undefined)
            query.netProfitInPercent = { $gte: options.minProfit };
        if (options?.rule)
            query.strategyName = options.rule;
        if (options?.testedAfter)
            query.timestamp = { $gte: new Date(options.testedAfter) };
        const result = await collection
            .find(query)
            .project({ trades: 0 })
            .toArray();
        return result;
    }
    async average5mVolume(databse, symbol, start, end) {
        const pipeline = [
            {
                $match: {
                    [this.timeKey]: {
                        $gte: start,
                        $lt: end || new Date(),
                    },
                },
            },
            //group by 5m
            {
                $group: {
                    _id: {
                        hour: { $hour: `$${this.timeKey}` },
                    },
                },
            },
        ];
        const db = client.db(databse);
        const collection = db.collection(symbol);
        const result = await collection.aggregate(pipeline);
        const data = await result.toArray();
        if (!data.length) {
            utils_1.logger.warn(`No data for ${symbol} in ${this.db}`);
            return;
        }
        return data[0].avgVolume;
    }
    async getLatestEntry(database, collection, timeKey) {
        const db = client.db(database);
        const collectionName = db.collection(collection);
        const result = await collectionName
            .find()
            .sort({ [timeKey || this.timeKey]: -1 })
            .limit(1)
            .toArray();
        return result[0];
    }
    async getSetOfRules(exchange, symbol) {
        const db = client.db("backtests");
        const collectionName = db.collection(exchange);
        const cursor = await collectionName.aggregate([
            {
                $match: {
                    symbol,
                },
            },
            {
                $group: {
                    _id: "$strategyName",
                },
            },
        ]);
        const data = await cursor.toArray();
        const result = data.map((d) => d._id);
        return result;
    }
}
exports.default = mongo;
//# sourceMappingURL=index.js.map