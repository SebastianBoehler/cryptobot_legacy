import { backtest } from './backtest'
import MongoWrapper from './mongodb'
import { logger } from './utils'

const mongo = new MongoWrapper('backtests')
const startCapital = 1500
const startDate = new Date('2024-01-01')
const exchange = 'okx'

;(async () => {
  const symbols = [{ symbol: 'SOL-USDT-SWAP' }] //[{ symbol: 'SOL-USDT-SWAP' }] // await mongo.symbolsSortedByVolume(exchange) //
  for (const { symbol } of symbols.filter((s) => s.symbol.includes('USDT'))) {
    const pairs = symbol.split('-')
    if (pairs[1] === 'USD') continue
    logger.info('starting backtest for', symbol)
    await backtest(symbol, exchange, startDate, undefined, startCapital, 'build_scalp_fast', {
      steps: 5,
      stopLoss: -11,
      multiplier: 0.85,
    })
  }

  await mongo.close()
  process.exit(0)
})()
