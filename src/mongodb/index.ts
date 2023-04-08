import { subMinutes } from "date-fns";
import { MongoClient, ObjectId } from "mongodb";
import config from "../config/config";
import { BacktestingResult } from "../types/trading";
import { logger } from "../utils";
import { GeneratedCandle, GetBacktestOptions } from "./types";
import { getTimeKey, TimeKey } from "./utils";
const client = new MongoClient(config.MONGO_URL);

process.on("SIGINT", async () => {
  await client.close();
});
process.on("exit", async () => {
  await client.close();
});

class mongo {
  private db: string;
  private timeKey: string;

  constructor(db: string) {
    this.db = db;
    this.timeKey = getTimeKey(db);
  }

  getClient() {
    return client;
  }

  async connect() {
    await client.connect();
    console.log(`connected to mongodb`);
  }

  async write(data: any, collectionName: string, database?: string) {
    const db = client.db(database || this.db);
    const collection = db.collection(collectionName);
    await collection.insertOne(data);
  }

  async existingCollections(database?: string) {
    const db = client.db(database || this.db);
    const collections = await db.listCollections().toArray();
    return collections.map((collection) => collection.name);
  }

  async listDatabases() {
    const databases = await client.db().admin().listDatabases();
    return databases;
  }

  async createUniqueIndex(
    collectionName: string,
    key: string,
    database?: string
  ) {
    const db = client.db(database || this.db);
    const collection = db.collection(collectionName);
    await collection.createIndex({ [key]: 1 }, { unique: true });
  }

  async writeMany(collectionName: string, data: any[]) {
    const db = client.db(this.db);
    const collection = db.collection(collectionName);
    await collection.insertMany(data);
  }

  async read(key: string, value: string, collectionName: string) {
    const db = client.db(this.db);
    const collection = db.collection(collectionName);
    const result = await collection.findOne({ [key]: value });
    return result;
  }

  async readLastCandle(collectionName: string, timeKey: TimeKey) {
    const db = client.db(this.db);
    const collection = db.collection(collectionName);
    const result = await collection
      .find()
      .sort({ [timeKey]: -1 })
      .limit(1)
      .toArray();
    return result[0];
  }

  async getStartAndEndDates(
    database: string,
    collectionName: string,
    timeKey: string
  ) {
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
      logger.warn(`No data for ${collectionName} in ${database}`);
      return;
    }
    const start = startResult[0][timeKey];
    const end = endResult[0][timeKey];
    return { start, end } as unknown as { start: Date; end: Date };
  }

  async getCount(collectionName: string, database?: string) {
    const db = client.db(database || this.db);
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();
    return count;
  }

  async generateCandle(
    granularity: number,
    timestamp: number,
    symbol: string
  ): Promise<GeneratedCandle | undefined> {
    const pipeline = [
      {
        $match: {
          [this.timeKey]: {
            $gte: subMinutes(timestamp, granularity),
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
    const result = await collection.aggregate<GeneratedCandle>(pipeline);
    const data = await result.toArray();

    if (!data.length) {
      logger.warn(`No data for ${symbol} at ${timestamp} in ${this.db}`);
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

  async getTimeAndClose(database: string, symbol: string, timeKey: TimeKey) {
    interface TimeAndCloseCandle {
      start?: Date;
      openTime?: Date;
      close: number;
      volume: number;
    }

    const values: TimeAndCloseCandle[] = [];
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
        .project<TimeAndCloseCandle>({ [timeKey]: 1, close: 1, volume: 1 })
        .sort({ [timeKey]: 1 })
        .limit(limit)
        .toArray();
      if (result.length < limit) break;

      values.push(...result);
    }

    return values;
  }

  async getEntryByTimestamp(
    database: string,
    symbol: string,
    timeKey: string,
    timestamp: number
  ) {
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

  async saveBacktest(result: BacktestingResult) {
    const db = client.db("backtests");
    const collection = db.collection(result.exchange);

    const query = {
      strategyName: result.strategyName,
      symbol: result.symbol,
    };

    const update = {
      $set: {
        ...result,
      },
    };

    const options = { upsert: true };

    await collection.updateOne(query, update, options);
  }

  async getBacktests(
    exchange: string,
    options?: GetBacktestOptions,
    project: Record<string, any> = { trades: 0 }
  ) {
    const db = client.db("backtests");
    const collection = db.collection(exchange);

    const query: Record<string, any> = {};
    if (options?.minProfit !== undefined)
      query.netProfitInPercent = { $gte: options.minProfit };
    if (options?.rule) query.strategyName = options.rule;
    if (options?.testedAfter)
      query.timestamp = { $gte: new Date(options.testedAfter) };
    if (options?._ids)
      query._id = { $in: options._ids.map((id) => new ObjectId(id)) };

    const result = await collection.find(query).project(project).toArray();

    return result;
  }

  async average5mVolume(
    databse: string,
    symbol: string,
    start: Date,
    end?: Date
  ) {
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
    const result = await collection.aggregate<{ avgVolume: number }>(pipeline);
    const data = await result.toArray();

    if (!data.length) {
      logger.warn(`No data for ${symbol} in ${this.db}`);
      return;
    }

    return data[0].avgVolume;
  }

  async getLatestEntry(database: string, collection: string, timeKey?: string) {
    const db = client.db(database);
    const collectionName = db.collection(collection);
    const result = await collectionName
      .find()
      .sort({ [timeKey || this.timeKey]: -1 })
      .limit(1)
      .toArray();
    return result[0];
  }

  async getSetOfRules(exchange: string, symbol: string) {
    const db = client.db("backtests");
    const collectionName = db.collection(exchange);
    const cursor = await collectionName.aggregate<{ _id: string[] }>([
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

export default mongo;
