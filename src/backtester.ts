import { backtest } from './backtest'
import MongoWrapper from './mongodb'
import { logger } from './utils'

const mongo = new MongoWrapper('backtests')
const startCapital = 80
const startDate = new Date('2023-09-01')
const exchange = 'bybit'

;(async () => {
  const symbols = await mongo.symbolsSortedByVolume(exchange) //[{ symbol: 'SOL-USDT-SWAP' }] // await mongo.symbolsSortedByVolume(exchange) //
  for (const { symbol } of symbols.filter((s) => s.symbol.includes('USDT'))) {
    const pairs = symbol.split('-')
    if (pairs[1] === 'USD') continue
    logger.debug('starting backtest for', symbol)
    await backtest(symbol, exchange, startDate, undefined, startCapital)
  }

  await mongo.close()
})()
