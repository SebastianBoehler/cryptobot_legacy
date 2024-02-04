import { BUILD_SCALP } from '../strategies/build_scalp'
import { logger, sleep } from '../utils'

//TODO: support for multiple tickers

//set by env variable
const symbol = 'SOL-USDT-SWAP'

// const strategies = [
//   {
//     strategy: new DCA(),
//     symbol: 'FTM-USDT-SWAP',
//     startCapital: 80,
//   },
// ]

const strategy = new BUILD_SCALP()
strategy.startCapital = 400
async function main() {
  await strategy.initalize(symbol, true, true)
  if (!strategy.orderHelper) throw new Error('no orderHelper')
  strategy.orderHelper.identifier = `${strategy.name}-${symbol}-live`
  await sleep(1000 * 5)
  while (true) {
    const price = strategy.orderHelper.price
    await strategy.update(price, [], new Date())

    const pos = strategy.orderHelper.position
    logger.debug('pos', pos)
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
