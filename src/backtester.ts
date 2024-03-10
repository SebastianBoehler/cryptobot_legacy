import { subDays } from 'date-fns'
import { backtest } from './backtest'
import MongoWrapper from './mongodb'
import { logger } from './utils'

const mongo = new MongoWrapper('backtests')
const startCapital = 400
const startDate = subDays(new Date(), 30 * 5)

;(async () => {
  const symbols = await mongo.symbolsSortedByVolume('okx') //[{ symbol: 'SOL-USDT-SWAP' }] // await mongo.symbolsSortedByVolume('okx') //
  for (const { symbol } of symbols.filter((s) => s.symbol.includes('USDT'))) {
    const pairs = symbol.split('-')
    if (pairs[1] === 'USD') continue
    logger.debug('starting backtest for', symbol)
    await backtest(symbol, startDate, undefined, startCapital)
  }

  await mongo.close()
})()
