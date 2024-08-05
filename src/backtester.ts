import { backtest } from './backtest'
import MongoWrapper from './mongodb'
import { logger } from './utils'

const mongo = new MongoWrapper('backtests')
const startCapital = 200
const startDate = new Date('2024-01-01')
const exchange = 'okx'

;(async () => {
  const symbols = [{ symbol: 'BONK-USDT-SWAP' }] //[{ symbol: 'SOL-USDT-SWAP' }] // await mongo.symbolsSortedByVolume(exchange) //
  for (const { symbol } of symbols.filter((s) => s.symbol.includes('USDT'))) {
    const pairs = symbol.split('-')
    if (pairs[1] === 'USD') continue
    logger.info('starting backtest for', symbol)
    await backtest(symbol, exchange, startDate, undefined, startCapital, 'build_scalp_fast', {
      steps: 3,
      stopLoss: -12,
      multiplier: 0.93,
      //leverReduce: -10,
      name: 'indicators',
    })
  }

  await mongo.close()
  process.exit(0)
})()
