import { BUILD_SCALP } from '../strategies/build_scalp'
import { logger, sleep } from '../utils'

if (!process.env.SYMBOL) throw new Error('no symbol')
if (!process.env.START_CAPITAL) throw new Error('no start capital')

//set by env variable
const symbol = process.env.SYMBOL

const strategy = new BUILD_SCALP()
strategy.startCapital = +process.env.START_CAPITAL

const multiplier = process.env.MULTIPLIER ? +process.env.MULTIPLIER : 1
if (strategy.multiplier && process.env.MULTIPLIER) strategy.multiplier = multiplier

async function main() {
  await strategy.initalize(symbol, true, true)
  if (!strategy.orderHelper) throw new Error('no orderHelper')
  strategy.orderHelper.identifier = `${strategy.name}-${symbol}-live`
  await sleep(1000 * 5)
  while (true) {
    const price = strategy.orderHelper.price
    await strategy.update(price, [], new Date())

    const pos = strategy.orderHelper.position
    logger.debug('pos', {
      ...pos,
      gains: strategy.orderHelper.profitUSD,
    })
    await sleep(1000 * 5)
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
