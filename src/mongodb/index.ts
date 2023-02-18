import { MongoClient } from 'mongodb';
import config from '../config/config';
const client = new MongoClient(config.MONGO_URL)

class mongo {
    private db: string

    constructor(db: string) {
        this.db = db
    }

    async connect() {
        await client.connect();
        console.log(`connected to mongodb`)
    }

    async write(data: any, collectionName: string) {
        const db = client.db(this.db)
        const collection = db.collection(collectionName)
        await collection.insertOne(data)
    }

    async existingCollections(database?: string) {
        const db = client.db(database || this.db)
        const collections = await db.listCollections().toArray()
        return collections.map((collection) => collection.name)
    }

    async listDatabases() {
        const databases = await client.db().admin().listDatabases()
        return databases
    }

    async createUniqueIndex(collectionName: string, key: string) {
        const db = client.db(this.db)
        const collection = db.collection(collectionName)
        await collection.createIndex({ [key]: 1 }, { unique: true })
    }

    async writeMany(collectionName: string, data: any[]) {
        const db = client.db(this.db)
        const collection = db.collection(collectionName)
        await collection.insertMany(data)
    }

    async read(key: string, value: string, collectionName: string) {
        const db = client.db(this.db)
        const collection = db.collection(collectionName)
        const result = await collection.findOne({ [key]: value })
        return result
    }

    async readLastCandle(collectionName: string, timeKey: string) {
        const db = client.db(this.db)
        const collection = db.collection(collectionName)
        const result = await collection.find().sort({ [timeKey]: -1 }).limit(1).toArray()
        return result[0]
    }

    async getStartAndEndDates(databse: string, collectionName: string, timeKey: string) {
        const db = client.db(databse)
        const collection = db.collection(collectionName)
        const [startResult, endResult] = await Promise.all([
            collection.find().sort({ [timeKey]: 1 }).limit(1).toArray(),
            collection.find().sort({ [timeKey]: -1 }).limit(1).toArray()
        ])
        const start = startResult[0][timeKey]
        const end = endResult[0][timeKey]
        return { start, end } as unknown as { start: Date, end: Date }
    }
}

export default mongo