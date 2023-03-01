import { subMinutes } from "date-fns";
import { MongoClient } from "mongodb";
import config from "../config/config";
import { BacktestingResult } from "../types/trading";
import { logger } from "../utils";
import { GeneratedCandle } from "./types";
import { getTimeKey, TimeKey } from "./utils";
const client = new MongoClient(config.MONGO_URL);

class mongo {
  private db: string;
  private timeKey: string;

  constructor(db: string) {
    this.db = db;
    this.timeKey = getTimeKey(db);
  }

  async connect() {
    await client.connect();
    console.log(`connected to mongodb`);
  }

  async write(data: any, collectionName: string) {
    const db = client.db(this.db);
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

  async createUniqueIndex(collectionName: string, key: string) {
    const db = client.db(this.db);
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
        .project<TimeAndCloseCandle>({ [timeKey]: 1, close: 1 })
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
    await collection.insertOne(result);
  }

  async average5mVolume(symbol: string, start: Date, end?: Date) {
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
            $subtract: [
              { $subtract: ["$" + this.timeKey, new Date(0)] },
              {
                $mod: [
                  { $subtract: ["$" + this.timeKey, new Date(0)] },
                  300000,
                ],
              },
            ],
          },
        },
      },
      //get average volume
      {
        $group: {
          _id: null,
          avgVolume: {
            $avg: {
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
    const result = await collection.aggregate<{ avgVolume: number }>(pipeline);
    const data = await result.toArray();

    if (!data.length) {
      logger.warn(`No data for ${symbol} in ${this.db}`);
      return;
    }

    return data[0].avgVolume;
  }
}

export default mongo;
