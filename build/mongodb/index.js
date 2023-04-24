"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const date_fns_1 = require("date-fns");
const mongodb_1 = require("mongodb");
const config_1 = __importDefault(require("../config/config"));
const utils_1 = require("../utils");
const client = new mongodb_1.MongoClient(config_1.default.MONGO_URL);
process.on("exit", async () => {
    await client.close();
});
client.on("close", () => {
    utils_1.logger.info("MongoDB connection will close");
});
client.on("connectionClosed", () => {
    utils_1.logger.info("MongoDB connection closed");
});
client.on("disconnected", () => {
    utils_1.logger.info("MongoDB disconnected");
});
client.on("error", (err) => {
    utils_1.logger.error("MongoDB error", err);
});
class mongo {
    db;
    constructor(db) {
        this.db = db;
    }
    getClient() {
        return client;
    }
    async connect() {
        await client.connect();
        utils_1.logger.info("Connected to MongoDB");
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
    async readLastCandle(collectionName) {
        const db = client.db(this.db);
        const collection = db.collection(collectionName);
        const result = await collection
            .find({})
            .sort({ start: -1 })
            .limit(1)
            .toArray();
        return result[0] || null;
    }
    async getStartAndEndDates(database, collectionName) {
        const db = client.db(database);
        const collection = db.collection(collectionName);
        const [startResult, endResult] = await Promise.all([
            collection.find().sort({ start: 1 }).limit(1).toArray(),
            collection.find().sort({ start: -1 }).limit(1).toArray(),
        ]);
        if (!startResult.length || !endResult.length) {
            utils_1.logger.warn(`No data for ${collectionName} in ${database}`);
            return;
        }
        const start = startResult[0].start;
        const end = endResult[0].start;
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
                    start: {
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
    async getTimeAndClose(database, symbol) {
        const values = [];
        const limit = 1000;
        const db = client.db(database);
        const collection = db.collection(symbol);
        while (true) {
            const lastTimestamp = values[values.length - 1]
                ? values[values.length - 1]["start"]
                : new Date(0);
            const result = await collection
                .find({
                start: {
                    $gt: lastTimestamp,
                },
            })
                .project({ start: 1, close: 1, volume: 1 })
                .sort({ start: 1 })
                .limit(limit)
                .toArray();
            values.push(...result);
            if (result.length < limit)
                break;
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
        const query = {
            strategyName: result.strategyName,
            symbol: result.symbol,
            start: result.start,
        };
        const update = {
            $set: {
                ...result,
            },
        };
        const options = { upsert: true };
        await collection.updateOne(query, update, options);
    }
    async getBacktests(exchange, options, project = { trades: 0 }) {
        const db = client.db("backtests");
        const collection = db.collection(exchange);
        const query = {};
        if (options?.minProfit !== undefined)
            query.netProfitInPercent = { $gte: options.minProfit };
        if (options?.rule)
            query.strategyName = options.rule;
        if (options?.testedAfter)
            query.timestamp = { $gte: new Date(options.testedAfter) };
        if (options?._ids)
            query._id = { $in: options._ids.map((id) => new mongodb_1.ObjectId(id)) };
        const result = await collection.find(query).project(project).toArray();
        return result;
    }
    async average5mVolume(databse, symbol, start, end) {
        const pipeline = [
            {
                $match: {
                    start: {
                        $gte: start,
                        $lt: end || new Date(),
                    },
                },
            },
            //group by 5m
            {
                $group: {
                    _id: {
                        hour: { $hour: `$start` },
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
    async getLatestEntry(database, collection, key = "start") {
        const db = client.db(database);
        const collectionName = db.collection(collection);
        const result = await collectionName
            .find()
            .sort({ [key]: -1 })
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
    async getLatestTransaction(symbol, exchange) {
        const db = client.db("trader");
        const collectionName = db.collection(`${exchange}_${symbol}`);
        const result = await collectionName
            .find({})
            .sort({ timestamp: -1 })
            .limit(1)
            .toArray();
        return result[0];
    }
    async writeTransaction(symbol, exchange, data) {
        const db = client.db("trader");
        const collectionName = db.collection(`${exchange}_${symbol}`);
        await collectionName.insertOne(data);
    }
}
exports.default = mongo;
//# sourceMappingURL=index.js.map