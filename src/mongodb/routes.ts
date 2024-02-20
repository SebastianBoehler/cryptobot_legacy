import express, { Request, Response } from 'express'
const router = express.Router()
import mongo from './index'
import { GenerateIndicators } from '../indicators'
import config from '../config/config'
const client = new mongo('admin')

const FIVE_MIN = 60 * 5
const ONE_DAY = 60 * 60 * 24

router.get('/databases', async (req: Request, res: Response) => {
  const databases = await client.listDatabases()
  res.send(databases)
})

router.get('/collections/:database', async (req: Request, res: Response) => {
  const { database } = req.params
  if (!database) {
    res.status(400).send('database query parameter is required')
    return
  }
  const collections = await client.existingCollections(database)
  res.set('Cache-control', `public, max-age=${FIVE_MIN}`)
  res.json(collections)
})

router.get('/count/:database/:collection', async (req: Request, res: Response) => {
  const { database, collection } = req.params
  if (!collection || !database) {
    res.status(400).send('database and collection query parameter is required')
    return
  }
  const count = await client.getCount(collection, database)
  res.set('Cache-control', `public, max-age=${FIVE_MIN}`)
  res.json(count)
})

router.get('/timeframe/:database/:collection', async (req: Request, res: Response) => {
  const { database, collection } = req.params
  if (!database) {
    res.status(400).send('database query parameter is required')
    return
  }

  const result = await client.getStartAndEndDates(database, collection)
  res.set('Cache-control', `public, max-age=${FIVE_MIN}`)
  res.json(result)
})

router.get('/indicators/:exchange/:symbol/:granularity', async (req: Request, res: Response) => {
  const { exchange, symbol, granularity } = req.params
  if (!exchange || !symbol || !granularity) {
    res.status(400).send('exchange, symbol and granularity query parameter is required')
    return
  }

  const indicator = new GenerateIndicators(exchange, symbol, +granularity)
  const data = await indicator.loadHistoricData()
  //res.set("Cache-control", `public, max-age=${ONE_DAY}`);
  res.json({
    count: data.length,
    symbol,
    granularity,
    data,
  })
})

router.get('/backtest', async (req: Request, res: Response) => {
  const { identifier } = req.query
  if (!identifier) {
    res.status(400).send('identifier params parameter is required')
    return
  }

  const result = await client.getBacktestingResult(identifier as string)
  if (config.NODE_ENV === 'prod') res.set('Cache-control', `public, max-age=${ONE_DAY}`)
  res.json(result)
})

router.get('/backtest/positions', async (req: Request, res: Response) => {
  const { identifier } = req.query
  if (!identifier) {
    res.status(400).send('identifier params parameter is required')
    return
  }

  const result = await client.loadAllPositions(identifier as string)
  if (config.NODE_ENV === 'prod') res.set('Cache-control', `public, max-age=${ONE_DAY}`)
  res.json(result)
})

router.get('/trader/orders', async (req: Request, res: Response) => {
  const { posId } = req.query
  if (!posId) {
    res.status(400).send('posId params parameter is required')
    return
  }

  const result = await client.getLiveOrders(posId as string)
  if (config.NODE_ENV === 'prod') res.set('Cache-control', `public, max-age=${FIVE_MIN}`)
  res.json(result)
})

router.get('/trader/positions', async (req: Request, res: Response) => {
  const { env } = req.query
  if (!env) {
    res.status(400).send('env params parameter is required')
    return
  }

  const result = await client.getLivePositions(env as string)
  if (config.NODE_ENV === 'prod') res.set('Cache-control', `public, max-age=${FIVE_MIN}`)
  res.json(result)
})

router.get('/symbolsSortedByVol/:exchange', async (req: Request, res: Response) => {
  const { exchange } = req.params
  if (!exchange) {
    res.status(400).send('exchange query parameter is required')
    return
  }

  const result = await client.symbolsSortedByVolume(exchange, true)
  if (config.NODE_ENV === 'prod') res.set('Cache-control', `public, max-age=${ONE_DAY}`)
  res.json(result)
})

export default router
