import { backtest } from './backtest'
import MongoWrapper from './mongodb'
import { logger } from './utils'

const mongo = new MongoWrapper('backtests')

;(async () => {
  const symbols = await mongo.symbolsSortedByVolume('okx') //[{ symbol: 'SOL-USDT-SWAP' }] // await mongo.symbolsSortedByVolume('okx') //
  for (const { symbol } of symbols.filter((s) => s.symbol.includes('USDT'))) {
    const pairs = symbol.split('-')
    if (pairs[1] === 'USD') continue
    logger.debug('starting backtest for', symbol)
    await backtest(symbol)
  }

  await mongo.close()
})()
