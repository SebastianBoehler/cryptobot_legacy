import { RestClient } from 'okx-api'
import { createChunks, logger, sleep } from '../utils'
import Mongo from '../mongodb/index'
import { addMinutes, subMonths } from 'date-fns'
import { DatabaseType } from 'cryptobot-types'
import config from '../config/config'

const mongo = new Mongo('okx')
const okxClient = new RestClient({
  apiKey: config.OKX_KEY,
  apiSecret: config.OKX_SECRET,
  apiPass: config.OKX_PASS,
})
const startTime = subMonths(new Date(), 12).getTime()

async function processSymbol(symbol: string) {
  const lastCandle = await mongo.readLastCandle(symbol)
  const lastCandleTime = lastCandle ? lastCandle.start : new Date(startTime)
  const secondsAgo = (new Date().getTime() - lastCandleTime.getTime()) / 1000
  if (secondsAgo < 70) return

  //logger.info(`Loading candles since ${lastCandleTime} for ${symbol}`);
  let candles = await okxClient.getHistoricCandles(symbol, '1m', {
    //after: lastCandleTime.getTime() + "",
    after: addMinutes(lastCandleTime, 100).getTime() + '',
  })

  //instrument probably got introduced after start time
  if (!candles.length) {
    candles = await okxClient.getHistoricCandles(symbol, '1m', {})
  }

  if (!candles || candles.length === 0) return
  candles.sort((a, b) => +a[0] - +b[0])

  //logger.debug(`Earliest candle: ${new Date(+candles[0][0])}}`);
  //logger.debug(`Latest candle: ${new Date(+candles[candles.length - 1][0])}}`);
  if (!lastCandle) {
    logger.info(`Creating unique index for ${symbol}`)
    await mongo.createUniqueIndex(symbol, 'start')
  }

  const data: DatabaseType[] = candles
    .map((candle) => {
      return {
        high: candle[2],
        low: candle[3],
        open: candle[1],
        close: candle[4],
        //! FIX WITH TYPES UPDATE
        //@ts-ignore
        volume: candle[7]!,
        start: new Date(+candle[0]),
      }
    })
    .filter(({ start }) => start.getTime() > lastCandleTime.getTime() && start.getTime() < new Date().getTime())

  if (data.length) await mongo.writeMany(symbol, data)
}

async function main() {
  const markets = await okxClient.getTickers('SWAP')
  const symbols = markets.map((market) => market.instId).filter((symbol) => !symbol.endsWith('-USD-SWAP'))

  const chunks = createChunks(symbols, 10)

  async function runChunks() {
    logger.info('Running chunks')
    for (const chunk of chunks) {
      try {
        await Promise.all(chunk.map(processSymbol))
        logger.info(`Successfully updated ${chunk.length} symbols`)
      } catch (e) {
        logger.error(e)
        await sleep(1000 * 30)
      } finally {
        await sleep(1_300)
      }
    }

    runChunks()
  }

  runChunks()
}

main()
