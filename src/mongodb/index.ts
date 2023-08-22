import { subDays, subMinutes } from "date-fns";
import { MongoClient, ObjectId, Document } from "mongodb";
import config from "../config/config";
import { BacktestingResult, OrderObject } from "../types/trading";
import { createChunks, logger } from "../utils";
import {
  Candle,
  DatabaseType,
  GeneratedCandle,
  GetBacktestOptions,
} from "../types/mongodb";
import fs from "fs";
import path from "path";
const client = new MongoClient(config.MONGO_URL);
const localClient = new MongoClient("mongodb://localhost:27017");

process.on("exit", async () => {
  await client.close();
});

client.on("close", () => {
  logger.info("MongoDB connection will close");
});
client.on("connectionClosed", () => {
  logger.info("MongoDB connection closed");
});
client.on("disconnected", () => {
  logger.info("MongoDB disconnected");
});
client.on("error", (err) => {
  logger.error("MongoDB error", err);
});
client.on("open", () => {
  logger.info(`MongoDB connected to ${config.MONGO_URL}`);
});

class mongo {
  private db: string;
  constructor(db: string) {
    this.db = db;
  }

  getClient() {
    return client;
  }

  async connect() {
    await client.connect();
    await localClient.connect();
    logger.info("Connected to MongoDB");
  }

  async aggregate<T extends Document>(
    pipeline: Document[],
    collectionName: string,
    database?: string
  ) {
    const db = client.db(database || this.db);
    const collection = db.collection(collectionName);
    const cursor = await collection.aggregate<T>(pipeline, {
      allowDiskUse: true,
    });
    return cursor;
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

  async readLastCandle(collectionName: string) {
    const db = client.db(this.db);
    const collection = db.collection(collectionName);
    const result = await collection
      .find<DatabaseType>({})
      .sort({ start: -1 })
      .limit(1)
      .toArray();
    return result[0] || null;
  }

  async getStartAndEndDates(database: string, collectionName: string) {
    const db = client.db(database);
    const collection = db.collection(collectionName);
    const [startResult, endResult] = await Promise.all([
      collection.find().sort({ start: 1 }).limit(1).toArray(),
      collection.find().sort({ start: -1 }).limit(1).toArray(),
    ]);

    if (!startResult.length || !endResult.length) {
      logger.warn(`No data for ${collectionName} in ${database}`);
      return;
    }
    const start = startResult[0].start;
    const end = endResult[0].start;
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
  ): Promise<Candle | undefined> {
    const start = subMinutes(timestamp, granularity);
    const pipeline = [
      {
        $match: {
          start: {
            $gte: start,
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
      start,
    };
  }

  async getHistory<T>(
    database: string,
    symbol: string,
    projection: Record<string, 1 | 0>
  ): Promise<T[]> {
    return await this.loadAllEntries(database, symbol, projection, {
      start: 1,
    });
  }

  private async loadAllEntries(
    database: string,
    collectionName: string,
    projection: Record<string, 1 | 0>,
    sort: { [key: string]: 1 | -1 }
  ) {
    const values: any[] = [];
    const limit = 1000;

    const db = client.db(database);
    const collection = db.collection(collectionName);

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
        .project(projection)
        .sort(sort)
        .limit(limit)
        .toArray();

      values.push(...result);
      if (result.length < limit) break;
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
    const db = localClient.db("backtests");
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

  async getBacktests(
    exchange: string,
    queryOptions?: GetBacktestOptions,
    project: Record<string, any> = { trades: 0 }
  ) {
    const db = localClient.db("backtests");
    const collection = db.collection(exchange);

    const query: Record<string, any> = {};
    if (queryOptions?.minProfit !== undefined)
      query.netProfitInPercent = { $gte: queryOptions.minProfit };
    if (queryOptions?.rule) query.strategyName = queryOptions.rule;
    if (queryOptions?.testedAfter)
      query.timestamp = { $gte: new Date(queryOptions.testedAfter) };
    if (queryOptions?._ids)
      query._id = { $in: queryOptions._ids.map((id) => new ObjectId(id)) };
    if (queryOptions?.start)
      query.start = {
        $gt: new Date(queryOptions.start.$gt),
      };

    logger.debug(query);

    const result = await collection.find(query).project(project).toArray();

    return result;
  }

  async getTradesOfBacktest(exchange: string, query: Record<string, any>) {
    const db = localClient.db("backtests");
    const collection = db.collection(exchange);

    const result = await collection
      .find(query)
      .project<{ trades: OrderObject[] }>({ trades: 1 })
      .toArray();

    return result[0] || { trades: [] };
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
    const result = await collection.aggregate<{ avgVolume: number }>(pipeline);
    const data = await result.toArray();

    if (!data.length) {
      logger.warn(`No data for ${symbol} in ${this.db}`);
      return;
    }

    return data[0].avgVolume;
  }

  async getLatestEntry(
    database: string,
    collection: string,
    key: string = "start",
    query: Record<string, any> = {}
  ) {
    const db = client.db(database);
    const collectionName = db.collection(collection);
    const result = await collectionName
      .find(query)
      .sort({ [key]: -1 })
      .limit(1)
      .toArray();
    return result[0];
  }

  async getFirstEntry(
    database: string,
    collection: string,
    key: string = "start",
    query: Record<string, any> = {}
  ) {
    const db = client.db(database);
    const collectionName = db.collection(collection);
    const result = await collectionName
      .find(query)
      .sort({ [key]: 1 })
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

  async getLatestTransaction(
    symbol: string,
    exchange: string
  ): Promise<OrderObject | undefined> {
    const db = client.db("trader");
    const collectionName = db.collection(`${exchange}_${symbol}`);
    const result = await collectionName
      .find<OrderObject>({})
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    return result[0];
  }

  async writeTransaction(symbol: string, exchange: string, data: OrderObject) {
    const db = client.db("trader");
    const collectionName = db.collection(`${exchange}_${symbol}`);
    await collectionName.insertOne(data);
  }

  async getSetOfField(
    database: string,
    collection: string,
    field: string | number
  ) {
    const db = client.db(database);
    const collectionName = db.collection(collection);
    const cursor = await collectionName.aggregate<{ _id: string }>([
      {
        $group: {
          _id: `$${field}`,
        },
      },
    ]);

    const data = await cursor.toArray();
    const result = data.map((d) => d._id);
    return result;
  }

  async symbolsSortedByVolume(
    database: string,
    loadFromFile: boolean = false
  ): Promise<{ symbol: string; volume: number }[]> {
    if (loadFromFile) {
      const raw = fs.readFileSync(
        path.join(__dirname, `./volumes_${database}.json`),
        "utf-8"
      );
      const data = JSON.parse(raw);
      return data;
    }
    const symbols = await this.existingCollections(database);
    const chunkedSymbols = createChunks(symbols, 4);
    const db = client.db(database);

    const pipeline = [
      {
        $match: {
          start: {
            $gte: subDays(new Date(), 30),
          },
        },
      },
      {
        $group: {
          _id: null,
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

    const volumes: { symbol: string; volume: number }[] = [];
    for (const chunk of chunkedSymbols) {
      const result = await Promise.all(
        chunk.map(async (symbol) => {
          const collection = db.collection(symbol);
          const data = await collection.aggregate(pipeline).toArray();
          return { symbol, volume: data[0]?.volume || 0 };
        })
      );

      volumes.push(...result);
    }

    const sorted = volumes.sort((a, b) => b.volume - a.volume);

    return sorted;
  }
}

export default mongo;
