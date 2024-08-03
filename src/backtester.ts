import { backtest } from './backtest'
import MongoWrapper from './mongodb'
import { logger } from './utils'

const mongo = new MongoWrapper('backtests')
const startCapital = 720
const startDate = new Date('2024-01-01')
const exchange = 'okx'

;(async () => {
  const symbols = [{ symbol: 'AR-USDT-SWAP' }] //[{ symbol: 'SOL-USDT-SWAP' }] // await mongo.symbolsSortedByVolume(exchange) //
  for (const { symbol } of symbols.filter((s) => s.symbol.includes('USDT'))) {
    const pairs = symbol.split('-')
    if (pairs[1] === 'USD') continue
    logger.info('starting backtest for', symbol)
    await backtest(symbol, exchange, startDate, undefined, startCapital, 'alts', {
      steps: 2,
      stopLoss: -19,
      multiplier: 0.94,
      //leverReduce: -5,
      name: 'prev_old',
    })
  }

  await mongo.close()
  process.exit(0)
})()
