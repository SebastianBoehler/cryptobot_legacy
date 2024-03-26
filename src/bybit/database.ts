import { subMinutes, subMonths } from 'date-fns'
import { createChunks, logger, sleep } from '../utils'
import Mongo from '../mongodb/index'
import { RestClientV5 } from 'bybit-api'
import { DatabaseType } from 'cryptobot-types'
import config from '../config/config'
const startTime = subMonths(new Date(), 6).getTime()
const mongo = new Mongo('bybit')
const client = new RestClientV5()

async function main() {
  const response = await client.getTickers({
    category: 'linear',
  })
  let ticker = response.result.list.map((item) => item.symbol).filter((symbol) => symbol.endsWith('USDT'))
  if (config.BYBIT_ENABLED_PAIRS.length) {
    ticker = ticker.filter((symbol) => config.BYBIT_ENABLED_PAIRS.includes(symbol))
  }

  const chunks = createChunks(ticker, 10)

  async function runChunks() {
    for (const chunk of chunks) {
      try {
        const result = await Promise.allSettled(chunk.map(processSymbol))
        logger.info(`Successfully updated ${result.filter((r) => r.status === 'fulfilled').length} symbols`)
      } catch (error: unknown) {
        logger.error(error)
        await sleep(1000 * 30)
      } finally {
        await sleep(1000)
      }
    }
    await sleep(1000 * 3)
    runChunks()
  }

  runChunks()
}

async function processSymbol(symbol: string) {
  const lastCandle = await mongo.readLastCandle(symbol)

  const lastCandleTime = lastCandle ? lastCandle.start : new Date(startTime)
  const secondsAgo = (new Date().getTime() - lastCandleTime.getTime()) / 1000
  if (secondsAgo < 70) return

  const { result } = await client.getKline({
    symbol,
    interval: '1',
    category: 'linear',
    limit: 1000,
    start: lastCandleTime.getTime(),
  })
  const candles: DatabaseType[] = result.list
    .map((candle) => {
      return {
        start: new Date(+candle[0]),
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5],
      }
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  if (!candles || candles.length === 0) return
  if (!lastCandle) {
    logger.info(`Creating unique index for ${symbol}`)
    await mongo.createUniqueIndex(symbol, 'start')
  }

  console.log(`Loaded ${candles.length} candles for ${symbol}`, lastCandle?.start)

  const filtered: DatabaseType[] = candles.filter(
    (candle) =>
      candle.start.getTime() > lastCandleTime.getTime() && candle.start.getTime() < subMinutes(new Date(), 1).getTime()
  )

  if (filtered.length === 0) return

  await mongo.writeMany(symbol, filtered)
}

main()
