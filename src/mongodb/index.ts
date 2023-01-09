import { MongoClient } from 'mongodb';
//JA9u6QobRh3Kzekn
//mongodb+srv://admin:<password>@cluster0.9zi210f.mongodb.net/test
const client = new MongoClient(`mongodb+srv://doadmin:9ng538R6v2CjmT17@db-mongodb-fra1-69253-e3316737.mongo.ondigitalocean.com/admin?tls=true&authSource=admin`)

class mongo {
    public db: string

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

    async existingCollections() {
        const db = client.db(this.db)
        const collections = await db.listCollections().toArray()
        return collections.map((collection) => collection.name)
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

    async readLastCandle(collectionName: string) {
        const db = client.db(this.db)
        const collection = db.collection(collectionName)
        const result = await collection.find().sort({ openTime: -1 }).limit(1).toArray()
        return result[0]
    }
}

export default mongo