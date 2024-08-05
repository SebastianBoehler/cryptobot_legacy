import { backtest } from './backtest'
import MongoWrapper from './mongodb'
import { logger } from './utils'

const mongo = new MongoWrapper('backtests')
const startCapital = 200
const startDate = new Date('2024-01-01')
const exchange = 'okx'

;(async () => {
  const symbols = [{ symbol: 'YGG-USDT-SWAP' }] //[{ symbol: 'SOL-USDT-SWAP' }] // await mongo.symbolsSortedByVolume(exchange) //
  for (const { symbol } of symbols.filter((s) => s.symbol.includes('USDT'))) {
    const pairs = symbol.split('-')
    if (pairs[1] === 'USD') continue
    logger.info('starting backtest for', symbol)
    await backtest(symbol, exchange, startDate, undefined, startCapital, 'alts', {
      steps: 2,
      stopLoss: -18,
      multiplier: 0.94,
      leverReduce: -13,
      name: 'indicators',
    })
  }

  await mongo.close()
  process.exit(0)
})()
