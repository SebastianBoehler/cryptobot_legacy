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
import strategyRoutes from './strategies/routes'
import stripeRoutes from './stripe/routes'
import pm2Routes from './pm2/routes'
import { logger } from './utils'
import config from './config/config'
import bodyParser from 'body-parser'

server.use(cors())
server.use(bodyParser.json({ limit: '30mb' }))

server.get('/health', (_req: Request, res: Response) => {
  res.status(200).send({
    message: 'Server is running',
  })
})

server.use('/stripe', stripeRoutes)

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
    logger.warn(
      `Unauthorized request from ${IP} to ${req.url} hasAuth: ${req.headers['hb-capital-auth'] !== undefined} hasBody ${
        req.body !== undefined
      }`
    )
    const reason = `Invalid auth, please contact support to get access.`
    res.status(401).send({
      message: 'Unauthorized',
      reason,
    })
    return
  }

  logger.debug(`Received ${req.method} request for ${req.url} from ${IP}`)
  const cacheInSeconds = 30
  res.set('Cache-control', `public, max-age=${cacheInSeconds}`)
  next()
}

server.use(middleware)

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150, // Limit each IP to 30 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})

server.use('/mongodb', mongoRoutes)
server.use(limiter)

server.use('/pm2', pm2Routes)
server.use('/strategy', strategyRoutes)

server.options('*', (_req, res: Response) => {
  res.status(200).send()
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

if (config.NODE_ENV === 'prod') {
  const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/api.hb-capital.app/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/api.hb-capital.app/fullchain.pem'),
  }

  https.createServer(options, server).listen(port, () => {
    console.log(`Server is running on port 443`)
  })
} else {
  server.listen(port, () => {
    console.log(`Server is running on port ${port}`)
  })
}
