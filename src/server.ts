import express, { Request, Response } from 'express'
import cors from 'cors'
import * as dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import { createHmac } from 'crypto'
import https from 'node:https'
import fs from 'node:fs'

dotenv.config({
  path: `${process.env.NODE_ENV?.split(' ').join('')}.env`,
})

const server = express()
const port = process.env.PORT || 3001

import mongoRoutes from './mongodb/routes'
import { createUniqueId, logger } from './utils'
import config from './config/config'
import { backtest } from './backtest'

server.use(cors())
server.use(express.json())

const middleware = async (req: Request, res: Response, next: any) => {
  const IP = req.ip || req.connection.remoteAddress
  //logger.http(`Received ${req.method} request for ${req.url} from ${IP}`);
  if (req.path === '/health') return next()

  const whitelist = config.API_WHITELIST || []
  const isWhitelisted = IP ? whitelist.includes(IP?.replace('::ffff:', '')) : false

  const secret = config.API_SECRET || ''
  const hash = createHmac('sha256', secret).update(req.path).digest('hex')

  //server side auth
  const validAuth = req.headers['hb-capital-auth'] === hash
  if (!validAuth && !isWhitelisted) {
    logger.warn(`Unauthorized request from ${IP}`)
    const reason = `Invalid auth, please contact support to get access.`
    res.status(401).send({
      message: 'Unauthorized',
      reason,
    })
    return next()
  }

  const cacheInSeconds = 30
  res.set('Cache-control', `public, max-age=${cacheInSeconds}`)
  next()
}

server.get('/health', (_req: Request, res: Response) => {
  res.status(200).send({
    message: 'Server is running',
  })
})

server.use(middleware)

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})

server.use(limiter)

server.use('/mongodb', mongoRoutes)

server.post('/backtest/trigger/:symbol', async (req: Request, res: Response) => {
  const symbol = req.params.symbol
  const { start, amount, strategy, steps, multiplier } = req.body
  const id = 'site-' + createUniqueId(8)
  if (!symbol) {
    res.status(400).send({
      message: 'Symbol not provided',
    })
    return
  }
  if (!start || !strategy || !amount || !steps) {
    res.status(400).send({
      message: 'Body params not valid, missing data',
    })
    return
  }

  backtest(symbol, new Date(start), id, amount, strategy, steps, multiplier)

  res.status(200).send({
    message: 'Backtest triggered',
    id,
  })
})

server.get('*', (_req: Request, res: Response) => {
  res.status(404).send({
    message: 'Not found',
  })
})

server.post('*', (_req: Request, res: Response) => {
  res.status(404).send({
    message: 'Not found',
  })
})

const options = {
  key: fs.readFileSync('../privateKey.pem'),
  cert: fs.readFileSync('../certificate.pem'),
}

https.createServer(options, server).listen(port, () => {
  console.log(`Server is running on port 443`)
})

// server.listen(port, () => {
//   console.log(`Server is running on port ${port}`)
// })
