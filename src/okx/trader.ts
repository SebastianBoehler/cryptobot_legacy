import { BUILD_SCALP } from '../strategies/build_scalp'
import { logger, sleep } from '../utils'

const strategies = [
  {
    strategy: new BUILD_SCALP(),
    symbol: 'SOL-USDT-SWAP',
    startCapital: 400,
  },
  {
    strategy: new BUILD_SCALP(),
    symbol: 'TIA-USDT-SWAP',
    startCapital: 40,
    multiplier: 0.95,
  },
]

async function main() {
  for (const item of strategies) {
    await item.strategy.initalize(item.symbol, true, true)
    if (!item.strategy.orderHelper) throw new Error('no orderHelper')
    item.strategy.orderHelper.identifier = `${item.strategy.name}-${item.symbol}-live`

    item.strategy.startCapital = item.startCapital
    if (item.multiplier) item.strategy.multiplier = item.multiplier
  }

  await sleep(1000 * 5)
  while (true) {
    for (const item of strategies) {
      if (!item.strategy.orderHelper) throw new Error(`[trader] OrderHelper not initialized ${item.symbol}`)
      const price = item.strategy.orderHelper.price
      await item.strategy.update(price, [], new Date())

      const pos = item.strategy.orderHelper.position
      logger.debug('pos', pos)
    }
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
