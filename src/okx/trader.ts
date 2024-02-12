import { Indicators } from 'cryptobot-types'
import { GenerateIndicators } from '../indicators'
import { BUILD_SCALP } from '../strategies/build_scalp'
import { BUILD_SCALP_FAST_V2 } from '../strategies/build_scalp_fast_v2'
import { SCALP_INDICATORS } from '../strategies/scalp_indicators'
import { logger, sleep } from '../utils'
import { BUILD_SCALP_FAST } from '../strategies/build_scalp_fast'
import MongoWrapper from '../mongodb'
import { LivePosition } from '../orderHelper'
import { livePositionMetrics } from '../pm2'

if (!process.env.SYMBOL) throw new Error('no symbol')
if (!process.env.START_CAPITAL) throw new Error('no start capital')
const mongo = new MongoWrapper('backtests')

//set by env variable
const symbol = process.env.SYMBOL

const strategies = {
  BUILD_SCALP: new BUILD_SCALP(),
  BUILD_SCALP_FAST: new BUILD_SCALP_FAST(),
  SCALP_INDICATORS: new SCALP_INDICATORS(),
  FAST_V2: new BUILD_SCALP_FAST_V2(),
}

const strategy = strategies[(process.env.STRATEGY || 'BUILD_SCALP') as keyof typeof strategies]
if (!strategy) throw new Error('no strategy')
logger.info(`Using strategy: ${strategy.name}`)
strategy.startCapital = +process.env.START_CAPITAL

const multiplier = process.env.MULTIPLIER ? +process.env.MULTIPLIER : 1
if (strategy.multiplier && process.env.MULTIPLIER) strategy.multiplier = multiplier

const indicators: GenerateIndicators[] = [new GenerateIndicators('okx', symbol, 5)]

async function main() {
  await strategy.initalize(symbol, true, true)
  if (!strategy.orderHelper) throw new Error('no orderHelper')
  strategy.orderHelper.identifier = `${strategy.name}-${symbol}-live`
  await sleep(1000 * 5)

  let index = 0
  while (true) {
    const indicatorsPromise = await Promise.all(indicators.map((i) => i.getIndicators(new Date()))).catch((e) => {
      logger.error('error getting indicators', e)
      return []
    })

    const indicatorsLoaded = indicatorsPromise.filter((i) => i !== undefined) as unknown as Indicators[]
    if (indicatorsLoaded.length !== indicators.length) {
      logger.error('indicators not loaded')
      await sleep(1000 * 5)
      continue
    }

    const price = strategy.orderHelper.price
    await strategy.update(price, indicatorsLoaded, new Date())

    const pos = strategy.orderHelper.position
    logger.debug('pos', {
      ...pos,
      gains: strategy.orderHelper.profitUSD,
    })

    if (index % 10 === 0) {
      await mongo.saveLivePosition(pos as unknown as LivePosition).catch((e) => {
        logger.error('[mongodb] saving live position', e)
      })
    }

    livePositionMetrics(pos)

    await sleep(1000 * 5)
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
