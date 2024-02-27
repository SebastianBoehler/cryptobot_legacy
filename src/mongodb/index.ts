import { subDays, subMinutes } from 'date-fns'
import { MongoClient, Document } from 'mongodb'
import config from '../config/config'
import { createChunks, logger } from '../utils'
import fs from 'fs'
import path from 'path'
import { Candle, CloseOrder, ClosedPosition, DatabaseType, GeneratedCandle, Order } from 'cryptobot-types'
import { LivePosition } from '../orderHelper'

//const FIVE_MINUTES = 1000 * 60 * 5
const client = new MongoClient(config.MONGO_URL, {
  appName: `cryptobot-${config.NODE_ENV} ${config.SYMBOL}`,
  //heartbeatFrequencyMS: FIVE_MINUTES,
  //socketTimeoutMS: FIVE_MINUTES,
})

process.on('exit', async () => {
  await client.close()
})

client.on('error', (err) => {
  logger.error('[mongodb] error', err)
})
client.on('open', () => {
  logger.info(`[mongodb] connected to ${config.MONGO_URL}`)
})

class MongoWrapper {
  private db: string
  constructor(db: string) {
    this.db = db
  }

  async close() {
    await client.close()
  }

  async connect() {
    await client.connect()
    logger.info('Connected to MongoDB')
  }

  async aggregate<T extends Document>(pipeline: Document[], collectionName: string, database?: string) {
    const db = client.db(database || this.db)
    const collection = db.collection(collectionName)
    const cursor = await collection.aggregate<T>(pipeline, {
      allowDiskUse: true,
    })
    return cursor
  }

  async existingCollections(database?: string) {
    const db = client.db(database || this.db)
    const collections = await db.listCollections().toArray()
    return collections.map((collection) => collection.name)
  }

  async getBacktestingResult<T>(identifier: string) {
    const db = client.db('backtests')
    const collection = db.collection('results')
    const result = await collection.findOne({ identifier })

    return result as T
  }

  async listDatabases() {
    const databases = await client.db().admin().listDatabases()
    return databases
  }

  async createUniqueIndex(collectionName: string, key: string, database?: string) {
    const db = client.db(database || this.db)
    const collection = db.collection(collectionName)
    await collection.createIndex({ [key]: 1 }, { unique: true })
  }

  async writeBacktestResults(collectionName: string, data: any[]) {
    const db = client.db(this.db)
    const collection = db.collection(collectionName)
    await collection.insertMany(data)
  }

  async writeMany(collectionName: string, data: any[], database?: string) {
    const db = client.db(database || this.db)
    const collection = db.collection(collectionName)
    await collection.insertMany(data)
  }

  async read(key: string, value: string, collectionName: string) {
    const db = client.db(this.db)
    const collection = db.collection(collectionName)
    const result = await collection.findOne({ [key]: value })
    return result
  }

  async writePosition<T extends ClosedPosition>(data: T, database?: string) {
    //@ts-ignore
    if (data._id) delete data._id

    const db = client.db(database || this.db)
    const collection = db.collection('positions')
    await collection.insertOne(data)
  }

  async readLastCandle(collectionName: string) {
    const db = client.db(this.db)
    const collection = db.collection(collectionName)
    const result = await collection.find<DatabaseType>({}).sort({ start: -1 }).limit(1).toArray()
    return result[0] || null
  }

  async readFirstCandle(collectionName: string) {
    const db = client.db(this.db)
    const collection = db.collection(collectionName)
    const result = await collection.find<DatabaseType>({}).sort({ start: 1 }).limit(1).toArray()
    return result[0] || null
  }

  async getStartAndEndDates(database: string, collectionName: string) {
    const db = client.db(database)
    const collection = db.collection(collectionName)
    const [startResult, endResult] = await Promise.all([
      collection.find().sort({ start: 1 }).limit(1).toArray(),
      collection.find().sort({ start: -1 }).limit(1).toArray(),
    ])

    if (!startResult.length || !endResult.length) {
      logger.warn(`No data for ${collectionName} in ${database}`)
      return
    }
    const start = startResult[0].start
    const end = endResult[0].start
    return { start, end } as unknown as { start: Date; end: Date }
  }

  async writeOrder(order: Order | CloseOrder, database: string = 'trader') {
    const db = client.db(database)
    const collection = db.collection('orders')
    await collection.insertOne(order)
  }

  async getOrders<T>(posId: string, database: string = 'trader') {
    const db = client.db(database)
    const collection = db.collection('orders')
    const result = await collection.find({ posId }).sort({ time: 1 }).toArray()
    return result as T[]
  }

  async getCount(collectionName: string, database?: string) {
    const db = client.db(database || this.db)
    const collection = db.collection(collectionName)
    const count = await collection.countDocuments()
    return count
  }

  async generateCandle(granularity: number, timestamp: number, symbol: string): Promise<Candle | undefined> {
    const start = subMinutes(timestamp, granularity)
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
          open: { $first: '$open' },
          high: { $max: '$high' },
          low: { $min: '$low' },
          close: { $last: '$close' },
          volume: {
            $sum: {
              $convert: {
                input: '$volume',
                to: 'double',
              },
            },
          },
        },
      },
    ]
    const db = client.db(this.db)
    const collection = db.collection(symbol)
    const result = await collection.aggregate<GeneratedCandle>(pipeline)
    const data = await result.toArray()

    if (!data.length) {
      logger.warn(`No data for ${symbol} at ${timestamp} in ${this.db}`)
      return
    }

    return {
      open: +data[0].open,
      high: +data[0].high,
      low: +data[0].low,
      close: +data[0].close,
      volume: +data[0].volume,
      start,
    }
  }

  async getHistory<T>(database: string, symbol: string, projection: Record<string, 1 | 0>): Promise<T[]> {
    return await this.loadAllEntries(database, symbol, projection, {
      start: 1,
    })
  }

  private async loadAllEntries(
    database: string,
    collectionName: string,
    projection: Record<string, 1 | 0>,
    sort: { [key: string]: 1 | -1 }
  ) {
    const values: any[] = []

    const db = client.db(database)
    const collection = db.collection(collectionName)

    projection = {
      ...projection,
      start: 1,
    }

    const cursor = collection.find().project(projection).sort(sort)

    while (await cursor.hasNext()) {
      const item = await cursor.next()
      if (item) values.push(item)
    }

    return values
  }

  async average5mVolume(databse: string, symbol: string, start: Date, end?: Date) {
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
    ]

    const db = client.db(databse)
    const collection = db.collection(symbol)
    const result = await collection.aggregate<{ avgVolume: number }>(pipeline)
    const data = await result.toArray()

    if (!data.length) {
      logger.warn(`No data for ${symbol} in ${this.db}`)
      return
    }

    return data[0].avgVolume
  }

  async getLatestEntry(database: string, collection: string, key: string = 'start', query: Record<string, any> = {}) {
    const db = client.db(database)
    const collectionName = db.collection(collection)
    const result = await collectionName
      .find(query)
      .sort({ [key]: -1 })
      .limit(1)
      .toArray()
    return result[0]
  }

  async getFirstEntry(database: string, collection: string, key: string = 'start', query: Record<string, any> = {}) {
    const db = client.db(database)
    const collectionName = db.collection(collection)
    const result = await collectionName
      .find(query)
      .sort({ [key]: 1 })
      .limit(1)
      .toArray()
    return result[0]
  }

  async getSetOfRules(exchange: string, symbol: string) {
    const db = client.db('backtests')
    const collectionName = db.collection(exchange)
    const cursor = await collectionName.aggregate<{ _id: string[] }>([
      {
        $match: {
          symbol,
        },
      },
      {
        $group: {
          _id: '$strategyName',
        },
      },
    ])

    const data = await cursor.toArray()
    const result = data.map((d) => d._id)
    return result
  }

  async loadAllPositions(identifier: string) {
    const db = client.db('backtests')
    const collectionName = db.collection('positions')
    const cursor = collectionName.find<ClosedPosition>({ identifier })

    const data: ClosedPosition[] = []

    while (await cursor.hasNext()) {
      const item = await cursor.next()
      if (item) data.push(item)
    }

    return data
  }

  async getSetOfField(database: string, collection: string, field: string | number) {
    const db = client.db(database)
    const collectionName = db.collection(collection)
    const cursor = await collectionName.aggregate<{ _id: string }>([
      {
        $group: {
          _id: `$${field}`,
        },
      },
    ])

    const data = await cursor.toArray()
    const result = data.map((d) => d._id)
    return result
  }

  async symbolsSortedByVolume(
    database: string,
    loadFromFile: boolean = false
  ): Promise<{ symbol: string; volume: number }[]> {
    if (loadFromFile) {
      const raw = fs.readFileSync(path.join(__dirname, `./volumes_${database}.json`), 'utf-8')
      const data = JSON.parse(raw)
      return data
    }
    const symbols = await this.existingCollections(database)
    const chunkedSymbols = createChunks(symbols, 4)
    const db = client.db(database)

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
                input: '$volume',
                to: 'double',
              },
            },
          },
        },
      },
    ]

    const volumes: { symbol: string; volume: number }[] = []
    for (const chunk of chunkedSymbols) {
      const result = await Promise.all(
        chunk.map(async (symbol) => {
          const collection = db.collection(symbol)
          const data = await collection.aggregate(pipeline).toArray()
          return { symbol, volume: data[0]?.volume || 0 }
        })
      )

      volumes.push(...result)
    }

    const sorted = volumes.sort((a, b) => b.volume - a.volume)

    return sorted
  }

  async loadHistoricCandles(granularity: number, symbol: string, afterTimestamp?: Date, exchange?: string) {
    const pipeline: Document[] = [
      {
        $group: {
          _id: {
            bucket: {
              $toDate: {
                $subtract: [
                  {
                    $toLong: '$start',
                  },
                  {
                    $mod: [
                      {
                        $subtract: [
                          { $toLong: '$start' },
                          {
                            $toLong: {
                              $dateFromString: {
                                dateString: '1970-01-01T00:00:00',
                                timezone: 'UTC',
                              },
                            },
                          },
                        ],
                      },
                      1000 * 60 * granularity,
                    ],
                  },
                ],
              },
            },
          },
          start: { $first: '$start' },
          high: { $max: '$high' },
          low: { $min: '$low' },
          open: { $first: '$open' },
          close: { $last: '$close' },
          volume: {
            $sum: {
              $convert: {
                input: '$volume',
                to: 'double',
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
        },
      },
      {
        $sort: {
          start: 1,
        },
      },
    ]

    if (afterTimestamp) {
      //insert after $group stage to filter buckets
      pipeline.splice(1, 0, {
        $match: {
          start: {
            $gte: afterTimestamp,
          },
        },
      })
    }

    const cursor = await this.aggregate<GeneratedCandle>(pipeline, symbol, exchange)

    const candles: GeneratedCandle[] = []
    while (await cursor.hasNext()) {
      const candle = await cursor.next()
      if (candle) candles.push(candle)
    }

    return candles
  }

  async saveLivePosition<T extends LivePosition>(position: T) {
    if (!position.posId) return
    const db = client.db('trader')
    const collection = db.collection('livePositions')
    await collection.updateOne(
      {
        posId: position.posId,
      },
      {
        $set: position,
      },
      {
        upsert: true,
      }
    )
  }

  async getLivePosition<T extends LivePosition>(posId: string) {
    const db = client.db('trader')
    const collection = db.collection('livePositions')
    const result = await collection
      .find<T>({
        posId,
      })
      .toArray()

    if (result.length > 1) {
      logger.error(`More than one live position found for ${posId}`)
    }
    const position = result[0]

    //@ts-ignore
    delete position._id
    return position
  }

  async getLiveOrders(posId: string) {
    const db = client.db('trader')
    const collection = db.collection('orders')
    const result = await collection
      .find<CloseOrder>({
        posId,
      })
      .toArray()
    return result
  }

  async getLivePositions(env: string) {
    const db = client.db('trader')
    const collection = db.collection('livePositions')
    const result = await collection
      .find<LivePosition>({
        env,
      })
      .project({
        orders: 0,
      })
      .toArray()
    return result
  }
}

export default MongoWrapper
