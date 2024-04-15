import { Indicators, MongoLivePosition } from 'cryptobot-types'
import { GenerateIndicators } from './indicators'
import { logger, sleep } from './utils'
import { BUILD_SCALP_FAST } from './strategies/build_scalp_fast'
import MongoWrapper from './mongodb'
import { livePositionMetrics } from './pm2'
import config from './config/config'
import { BUILD_FAST } from './strategies/build_fast'
import { BUILD_SCALP_FAST_INDICATORS } from './strategies/scalp_indicators'
import { BUILD_SCALP_FAST_ALTS } from './strategies/scalp_fast_alts'
import { TESTING } from './strategies/testing'
import { IOrderHelperPos } from './types'
import { SCALP_FAST_TEST } from './strategies/scalp_fast_test'

if (!config.SYMBOL) throw new Error('no symbol')
if (!config.START_CAPITAL) throw new Error('no start capital')
if (!config.EXCHANGE) throw new Error('no exchange')

const mongo = new MongoWrapper('backtests')

//set by env variable
const symbol = config.SYMBOL
const exchange = config.EXCHANGE
const strategyName = config.STRATEGY

const strategies = {
  BUILD_FAST: new BUILD_FAST(),
  BUILD_SCALP_FAST: new BUILD_SCALP_FAST(),
  INDICATORS: new BUILD_SCALP_FAST_INDICATORS(),
  SCALP_ALTS: new BUILD_SCALP_FAST_ALTS(),
  SCALP_TEST: new SCALP_FAST_TEST(),
  TESTING: new TESTING(),
}

const strategy = strategies[strategyName as keyof typeof strategies]
if (!strategy) throw new Error(`no strategy found for ${strategyName}`)
logger.info(`Using strategy: ${strategy.name} on ${symbol} on ${exchange}`)
strategy.startCapital = config.START_CAPITAL
logger.debug(`Set start capital to ${strategy.startCapital}`)

const multiplier = process.env.MULTIPLIER ? +process.env.MULTIPLIER : 1
if (strategy.multiplier && process.env.MULTIPLIER) strategy.multiplier = multiplier

let indicators: GenerateIndicators[] = [
  new GenerateIndicators(exchange, symbol, 5),
  new GenerateIndicators(exchange, symbol, 60 * 8),
]

async function main() {
  await strategy.initalize(symbol, exchange, true, true)
  if (!strategy.orderHelper) throw new Error('no orderHelper')
  strategy.orderHelper.identifier = `${strategy.name}-${symbol}-live`
  if (!strategy.requiresIndicators) indicators = []
  await sleep(1000 * 10)

  let index = 0
  while (true) {
    const indicatorsPromise = await Promise.all(indicators.map((i) => i.getIndicators(new Date()))).catch((e) => {
      logger.error('error getting indicators', e)
      return []
    })

    const indicatorsLoaded = indicatorsPromise.filter((i) => i !== undefined) as unknown as Indicators[]
    if (indicatorsLoaded.length !== indicators.length && strategy.requiresIndicators) {
      logger.error('indicators not loaded')
      await sleep(1000 * 5)
      continue
    }

    const price = strategy.orderHelper.price
    //TODO: continue while no incoming ticker stream received yet
    await strategy.update(price, indicatorsLoaded, new Date())

    const pos = strategy.orderHelper.position as IOrderHelperPos | null
    const profitUSD = strategy.orderHelper.profitUSD
    logger.info('pos', {
      ...pos,
      orders: pos?.orders.map((o) => ({ ordId: o.ordId })),
      profitUSD,
    })

    if (index % 15 === 0 && pos) {
      //prop comes from loading live position data on startup
      const obj: MongoLivePosition = {
        ...pos,
        env: config.NODE_ENV,
        strategy: {
          name: strategy.name,
          startCapital: strategy.startCapital,
          multiplier: strategy.multiplier,
        },
        profitUSD,
        timestamp: new Date().toString(),
        exchange,
      }
      await mongo.saveLivePosition(obj).catch((e) => {
        logger.error('[mongodb] error saving live position', e)
      })
      index = 0
    }

    livePositionMetrics(pos)

    await sleep(1000 * 3)
    index++
  }
}

main()

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

process.on('beforeExit', () => {
  logger.debug('beforeExit')
  //const obj = strategy.orderHelper?.position
  //save to mongo
  //maybe scale position down if trader stops running
})
