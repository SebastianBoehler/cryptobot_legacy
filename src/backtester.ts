import { backtest } from './backtest'
import MongoWrapper from './mongodb'
import { logger } from './utils'

const mongo = new MongoWrapper('backtests')
const startCapital = 350
const startDate = new Date('2024-08-04')
const exchange = 'okx'

;(async () => {
  const symbols = [{ symbol: 'FTM-USDT-SWAP' }] //[{ symbol: 'SOL-USDT-SWAP' }] // await mongo.symbolsSortedByVolume(exchange) //
  for (const { symbol } of symbols.filter((s) => s.symbol.includes('USDT'))) {
    const pairs = symbol.split('-')
    if (pairs[1] === 'USD') continue
    logger.info('starting backtest for', symbol)
    await backtest(symbol, exchange, startDate, undefined, startCapital, 'build_scalp_fast', {
      steps: 7,
      stopLoss: -17,
      multiplier: 0.95,
      //leverReduce: -13,
    })
  }

  await mongo.close()
  process.exit(0)
})()
