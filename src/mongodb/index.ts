import { subDays, subMinutes } from 'date-fns'
import { MongoClient, Document } from 'mongodb'
import config from '../config/config'
import { createChunks, logger } from '../utils'
import fs from 'fs'
import path from 'path'
import {
  Candle,
  CloseOrder,
  ClosedPosition,
  DatabaseType,
  GeneratedCandle,
  Order,
  ExtendedOrder,
  TraderAction,
  MongoLivePosition,
} from 'cryptobot-types'

class MongoWrapper {
  private db: string
  private client: MongoClient
  constructor(db: string, url?: string) {
    this.db = db
    this.client = new MongoClient(url || config.MONGO_URL, {
      appName: `cryptobot-${config.NODE_ENV} ${config.SYMBOL}`,
      //heartbeatFrequencyMS: FIVE_MINUTES,
      //socketTimeoutMS: FIVE_MINUTES,
    })

    this.client.on('error', (err) => {
      logger.error('[mongodb] error', err)
    })
  }

  async close() {
    await this.client.close()
  }

  async connect() {
    await this.client.connect()
    logger.info(`[mongodb] connected to ${this.client.options}`)
  }

  async aggregate<T extends Document>(pipeline: Document[], collectionName: string, database?: string) {
    const db = this.client.db(database || this.db)
    const collection = db.collection(collectionName)
    const cursor = await collection.aggregate<T>(pipeline, {
      allowDiskUse: true,
    })
    return cursor
  }

  async existingCollections(database?: string) {
    const db = this.client.db(database || this.db)
    const collections = await db.listCollections().toArray()
    return collections.map((collection) => collection.name)
  }

  async getBacktestingResults<T extends Document>(stages: Document[] = []) {
    const db = this.client.db('backtests')
    const collection = db.collection('results')
    const pipeline = stages
    const cursor = collection.aggregate<T>(pipeline)

    const results = []
    while (await cursor.hasNext()) {
      const result = await cursor.next()
      if (result) results.push(result)
    }

    return results
  }

  async listDatabases() {
    const databases = await this.client.db().admin().listDatabases()
    return databases
  }

  async createUniqueIndex(collectionName: string, key: string, database?: string) {
    const db = this.client.db(database || this.db)
    const collection = db.collection(collectionName)
    await collection.createIndex({ [key]: 1 }, { unique: true })
  }

  async writeMany(collectionName: string, data: any[], database?: string) {
    if (!data.length) return
    const db = this.client.db(database || this.db)
    const collection = db.collection(collectionName)
    await collection.insertMany(data)
  }

  async read(key: string, value: string, collectionName: string) {
    const db = this.client.db(this.db)
    const collection = db.collection(collectionName)
    const result = await collection.findOne({ [key]: value })
    return result
  }

  async readMany(query: Record<string, any>, collectionName: string, database?: string) {
    const db = this.client.db(database || this.db)
    const collection = db.collection(collectionName)
    const result = await collection.find(query).toArray()
    return result
  }

  async delete(query: Record<string, any> = {}, collectionName: string, database?: string) {
    const db = this.client.db(database || this.db)
    const collection = db.collection(collectionName)
    await collection.deleteMany(query)
  }

  async deleteCollection(collectionName: string, database?: string) {
    const db = this.client.db(database || this.db)
    const collection = db.collection(collectionName)
    await collection.drop()
  }

  async addFields(collectionName: string, fields: Record<string, any>, query: Record<string, any>, database?: string) {
    const db = this.client.db(database || this.db)
    const collection = db.collection(collectionName)
    await collection.updateMany(query, { $set: fields })
  }

  async writePosition<T extends ClosedPosition>(data: T, database?: string) {
    //@ts-ignore
    if (data._id) {
      logger.warn(`_id field is not allowed in writePosition`)
      //@ts-ignore
      delete data._id
    }

    const db = this.client.db(database || this.db)
    const collection = db.collection('positions')
    await collection.insertOne(data)
  }

  async readLastCandle(collectionName: string) {
    const db = this.client.db(this.db)
    const collection = db.collection(collectionName)
    const result = await collection.find<DatabaseType>({}).sort({ start: -1 }).limit(1).toArray()
    return result[0] || null
  }

  async readFirstCandle(collectionName: string) {
    const db = this.client.db(this.db)
    const collection = db.collection(collectionName)
    const result = await collection.find<DatabaseType>({}).sort({ start: 1 }).limit(1).toArray()
    return result[0] || null
  }

  async getStartAndEndDates(database: string, collectionName: string) {
    const db = this.client.db(database)
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

  async writeOrder(order: ExtendedOrder<Order | CloseOrder>, database: string = 'trader') {
    const db = this.client.db(database)
    const collection = db.collection('orders')
    await collection.insertOne(order)
  }

  async getOrders<T>(posId: string, database: string = 'trader') {
    const db = this.client.db(database)
    const collection = db.collection('orders')
    const result = await collection.find({ posId }).sort({ time: 1 }).toArray()
    return result as T[]
  }

  async getCount(collectionName: string, database?: string) {
    const db = this.client.db(database || this.db)
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
        $sort: {
          start: 1,
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
    const db = this.client.db(this.db)
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

    const db = this.client.db(database)
    const collection = db.collection(collectionName)

    projection = {
      _id: 0,
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

    const db = this.client.db(databse)
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
    const db = this.client.db(database)
    const collectionName = db.collection(collection)
    const result = await collectionName
      .find(query)
      .sort({ [key]: -1 })
      .limit(1)
      .toArray()
    return result[0]
  }

  async getFirstEntry(database: string, collection: string, key: string = 'start', query: Record<string, any> = {}) {
    const db = this.client.db(database)
    const collectionName = db.collection(collection)
    const result = await collectionName
      .find(query)
      .sort({ [key]: 1 })
      .limit(1)
      .toArray()
    return result[0]
  }

  async getSetOfRules(exchange: string, symbol: string) {
    const db = this.client.db('backtests')
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
    const db = this.client.db('backtests')
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
    const db = this.client.db(database)
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
    const db = this.client.db(database)

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
        $sort: {
          start: 1,
        },
      },
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

  async saveLivePosition(position: MongoLivePosition) {
    if (!position.posId) return
    const db = this.client.db('trader')
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

  async updateUpsert(data: any, key: string, collectionName: string, database: string) {
    const db = this.client.db(database)
    const collection = db.collection(collectionName)
    await collection.updateOne(
      {
        [key]: data[key],
      },
      {
        $set: data,
      },
      {
        upsert: true,
      }
    )
  }

  async getLivePosition(posId: string) {
    const db = this.client.db('trader')
    const collection = db.collection('livePositions')
    const result = await collection
      .find({
        posId,
      })
      .project<MongoLivePosition>({
        _id: 0,
      })
      .toArray()

    if (result.length > 1) {
      logger.error(`More than one live position found for ${posId}`)
    }
    const position = result[0]
    return position
  }

  async getLiveOrders(query: Record<string, any>, page?: number, sort: Record<string, 1 | -1> = { time: -1 }) {
    const db = this.client.db('trader')
    const collection = db.collection('orders')
    const cursor = collection.find(query).sort(sort).project<CloseOrder>({
      _id: 0,
    })

    if (page !== undefined) {
      cursor.skip(page * 30).limit(30)
    }

    const orders: (Order | CloseOrder)[] = []
    while (await cursor.hasNext()) {
      const order = await cursor.next()
      if (order) orders.push(order)
    }

    return orders
  }

  async getLivePositions(ids: string[]) {
    const db = this.client.db('trader')
    const collection = db.collection('livePositions')
    const cursor = collection.aggregate<MongoLivePosition>([
      {
        $match: {
          posId: {
            $in: ids,
          },
        },
      },
      {
        $project: {
          _id: 0,
        },
      },
    ])

    const positions = []
    while (await cursor.hasNext()) {
      const position = await cursor.next()
      if (position) positions.push(position)
    }

    return positions
  }

  async getAccBalances(accHash: string, granularity: number, $limit: number = 50) {
    const db = this.client.db('trader')
    const collection = db.collection('accountBalances')
    //pipeline and buckets of granulartiy
    const pipeline = [
      {
        $sort: {
          time: -1,
        },
      },
      {
        $match: {
          accHash,
        },
      },
      {
        $group: {
          _id: {
            bucket: {
              $toDate: {
                $subtract: [
                  {
                    $toLong: '$time',
                  },
                  {
                    $mod: [
                      {
                        $subtract: [
                          { $toLong: '$time' },
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
          time: { $first: '$time' },
          value: { $last: '$value' },
        },
      },
      {
        $project: {
          _id: 0,
        },
      },
      {
        $limit,
      },
      {
        $sort: {
          time: 1,
        },
      },
    ]

    const cursor = await collection.aggregate<{ time: Date; value: number }>(pipeline)
    const values: { time: Date; value: number }[] = []
    while (await cursor.hasNext()) {
      const value = await cursor.next()
      if (value) values.push(value)
    }

    return values
  }

  async storeAction(action: TraderAction | TraderAction[]) {
    const db = this.client.db('trader')
    const collection = db.collection('actions')
    if (Array.isArray(action)) {
      await collection.insertMany(action)
    } else {
      await collection.insertOne(action)
    }
  }

  async getActions(query: Record<string, any>, page?: number, sort: Record<string, 1 | -1> = { time: -1 }) {
    const db = this.client.db('trader')
    const collection = db.collection('actions')
    const cursor = collection.find<TraderAction>(query).sort(sort)

    if (page !== undefined) {
      cursor.skip(page * 30).limit(30)
    }

    const actions: TraderAction[] = []
    while (await cursor.hasNext()) {
      const action = await cursor.next()
      if (action) actions.push(action)
    }

    return actions
  }

  async loadLastLeverIncrease(symbol: string, accHash: string) {
    const db = this.client.db('trader')
    const collection = db.collection('actions')
    const result = await collection
      .find<TraderAction>({
        action: 'leverage change',
        after: { $gt: '$prev' },
        symbol,
        $expr: { $gt: ['$after', '$prev'] },
        accHash,
      })
      .sort({ time: -1 })
      .limit(1)
      .toArray()

    return result[0]
  }

  async loadChatHistory(sessionId: string) {
    const db = this.client.db('chats')
    const collection = db.collection(sessionId)
    const result = await collection.find().sort({ time: 1 }).toArray()

    return result
  }

  async saveChatMessages(messages: any[], sessionId: string) {
    const db = this.client.db('chats')
    const collection = db.collection(sessionId)
    await collection.insertMany(messages)
  }

  async deleteChatMessages(messages: { _id?: string; time: Date; parts: any; role: string }[], sessionId: string) {
    const db = this.client.db('chats')
    const collection = db.collection(sessionId)
    // _id might not be present in all messages so we use time
    console.log(messages)
    await collection.deleteMany({
      time: { $in: messages.map((m) => m.time) },
    })
  }

  //update user profile function where you can only update some fields
  async updateUserProfile(userId: string, setFields: Record<string, any>) {
    const db = this.client.db('users')
    const collection = db.collection('profiles')

    await collection.updateOne({ userId }, { $set: setFields })
  }

  //should only work if the user profile doesn't exist
  async createUserProfile(userId: string, fields: Record<string, any>) {
    const db = this.client.db('users')
    const collection = db.collection('profiles')

    // if the user profile already exists, return
    const existingProfile = await collection.findOne({ userId })
    if (existingProfile) return

    await collection.insertOne({ userId, ...fields })
  }

  async getUserProfile(userId: string) {
    const db = this.client.db('users')
    const collection = db.collection('profiles')
    const profile = await collection.findOne({ userId })
    return profile
  }
}

export default MongoWrapper
