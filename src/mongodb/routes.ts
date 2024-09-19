import express, { Request, Response } from 'express'
const router = express.Router()
import mongo from './index'
import config from '../config/config'
import { subDays } from 'date-fns'
const client = new mongo('admin')

const FIVE_MIN = 60 * 5

router.post('/backtest', async (req: Request, res: Response) => {
  const { $match, $sort, page, $project } = req.body

  const limit = 30
  const pipeline: any[] = []
  if ($sort) pipeline.unshift({ $sort })
  if (page) pipeline.push(...[{ $skip: page * limit }, { $limit: limit }])
  if ($match) pipeline.unshift({ $match })
  if ($project) pipeline.push({ $project })

  const result = await client.getBacktestingResults(pipeline)
  res.json(result)
})

router.get('/backtest/positions', async (req: Request, res: Response) => {
  const { identifier } = req.query
  if (!identifier) {
    res.status(400).send('identifier params parameter is required')
    return
  }

  const result = await client.loadAllPositions({
    identifier: identifier as string,
  })
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
  res.json(result)
})

router.post('/trader/positions', async (req: Request, res: Response) => {
  const { ids } = req.body
  if (!ids) {
    res.status(400).send('ids params parameter is required')
    return
  }

  const result = await client.getLivePositions(ids)
  res.json(result)
})

router.post('/trader/actions', async (req: Request, res: Response) => {
  const { query, page, sort } = req.body

  if (!query) {
    res.status(400).send('query as params parameter is required')
    return
  }

  const result = await client.getActions((query as Record<string, any>) || {}, page, sort)
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

router.post('/trader/calendarProfits', async (req: Request, res: Response) => {
  const { accHashes, limit, skip } = req.body
  if (!accHashes || !limit) {
    res.status(400).send('accHashes and limit body parameter is required')
    return
  }

  const pipeline: any[] = [
    {
      $match: {
        accHash: { $in: accHashes }, // Replace with actual accHash array
        time: { $gte: subDays(new Date(), +limit) }, // Filter last 30 days
      },
    },
    {
      $project: {
        year: { $year: '$time' },
        month: { $month: '$time' },
        day: { $dayOfMonth: '$time' },
        bruttoPnlUSD: 1,
      },
    },
    {
      $addFields: {
        date: { $dateFromParts: { year: '$year', month: '$month', day: '$day' } },
      },
    },
    {
      $group: {
        _id: '$date',
        totalProfit: { $sum: '$bruttoPnlUSD' },
      },
    },
    {
      $sort: { _id: -1 },
    },
    {
      $skip: parseInt(skip as string) || 0, // Add skip stage
    },
    {
      $limit: parseInt(limit as string), // Replace with the actual limit
    },
  ]

  try {
    const result = await client.aggregate(pipeline, 'orders', 'trader')
    const data = await result.toArray()

    if (config.NODE_ENV === 'prod') res.set('Cache-control', `public, max-age=${FIVE_MIN}`)
    res.json(data)
  } catch (error) {
    console.error(error)
    res.status(500).send('Internal Server Error')
  }
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

  res.json(profile)
})

export default router
