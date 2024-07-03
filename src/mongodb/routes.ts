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

router.post('/backtest', async (req: Request, res: Response) => {
  const { $match, $sort, page, $project } = req.body

  const limit = 30
  const pipeline: any[] = []
  if ($sort) pipeline.unshift({ $sort })
  if (page) pipeline.push(...[{ $skip: page * limit }, { $limit: limit }])
  if ($match) pipeline.unshift({ $match })
  if ($project) pipeline.push({ $project })

  const result = await client.getBacktestingResults(pipeline)
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

router.post('/backtest/delete', async (req: Request, res: Response) => {
  const { query, password } = req.body
  if (!query || !password) {
    res.status(400).send('query and password params parameter is required')
    return
  }
  if (password !== 'Anmeldedatum0702!') {
    res.status(401).send('Unauthorized')
    return
  }

  await Promise.all([client.delete(query, 'positions', 'backtests'), client.delete(query, 'results', 'backtests')])
  res.status(200).json({ message: 'Deleted' })
})

router.post('/trader/orders', async (req: Request, res: Response) => {
  const { query, page, sort } = req.body

  const result = await client.getLiveOrders((query as Record<string, any>) || {}, page, sort)
  if (config.NODE_ENV === 'prod') res.set('Cache-control', `public, max-age=${FIVE_MIN}`)
  res.json(result)
})

router.post('/trader/positions', async (req: Request, res: Response) => {
  const { ids } = req.body
  if (!ids) {
    res.status(400).send('ids params parameter is required')
    return
  }

  const result = await client.getLivePositions(ids)
  if (config.NODE_ENV === 'prod') res.set('Cache-control', `public, max-age=${FIVE_MIN}`)
  res.json(result)
})

router.post('/trader/actions', async (req: Request, res: Response) => {
  const { query, page, sort } = req.body

  if (!query) {
    res.status(400).send('query as params parameter is required')
    return
  }

  const result = await client.getActions((query as Record<string, any>) || {}, page, sort)
  if (config.NODE_ENV === 'prod') res.set('Cache-control', `public, max-age=${FIVE_MIN}`)
  res.json(result)
})

router.get('/trader/accBalances', async (req: Request, res: Response) => {
  const { accHash, granularity, limit } = req.query
  if (!accHash) {
    res.status(400).send('accHash query parameter is required')
    return
  }
  const $limit = +(limit as string) || undefined

  const result = await client.getAccBalances(accHash as string, +(granularity || 15), $limit)
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

router.get('/chat/history', async (req: Request, res: Response) => {
  const { session } = req.query
  if (!session) {
    res.status(400).send('user and session query parameter is required')
    return
  }

  const history = await client.loadChatHistory(session as string)

  res.set('Cache-control', `public, max-age=0`)
  res.json(history)
})

router.post('/chat/save', async (req: Request, res: Response) => {
  const { session, messages } = req.body
  if (!session || !messages) {
    res.status(400).send('user, session and messages query parameter is required')
    return
  }

  await client.saveChatMessages(messages as any[], session as string)

  res.json({ message: 'saved' })
})

router.post('/chat/message/delete', async (req: Request, res: Response) => {
  const { messages, session } = req.body
  if (!session || !messages) {
    res.status(400).send('session and messages query parameter is required')
    return
  }

  await client.deleteChatMessages(messages, session)

  res.json({ message: 'deleted' })
})

router.delete('/chat/delete/:session', async (req: Request, res: Response) => {
  const { session } = req.params
  if (!session) {
    res.status(400).send('session query parameter is required')
    return
  }

  await client.deleteCollection(session, 'chats')
  res.json({ message: 'deleted' })
})

router.post('/user/profile/update', async (req: Request, res: Response) => {
  const { setFields, user } = req.body
  if (!user) {
    res.status(400).send('user query parameter is required')
    return
  }

  await client.updateUserProfile(user as string, setFields || {})

  res.json({ message: 'saved' })
})

router.post('/user/profile/create', async (req: Request, res: Response) => {
  const { user, fields } = req.body
  if (!user || !fields) {
    res.status(400).send('user and fields query parameter is required')
    return
  }

  await client.createUserProfile(user as string, fields as Record<string, any>)

  res.json({ message: 'saved' })
})

router.get('/user/profile/:user', async (req: Request, res: Response) => {
  const { user } = req.params
  if (!user) {
    res.status(400).send('user query parameter is required')
    return
  }

  const profile = await client.getUserProfile(user)

  res.set('Cache-control', `public, max-age=0`)
  res.json(profile)
})

export default router
