import { RestClient } from 'okx-api'
import { createChunks, logger, sleep } from '../utils'
import Mongo from '../mongodb/index'
import { DatabaseType } from 'cryptobot-types'
import config from '../config/config'
import { subDays } from 'date-fns'

const mongo = new Mongo('okx')
const okxClient = new RestClient({
  apiKey: config.OKX_KEY,
  apiSecret: config.OKX_SECRET,
  apiPass: config.OKX_PASS,
})

const until = subDays(new Date(), 31 * 12 * 3)

async function processSymbol(symbol: string) {
  const firstCandle = await mongo.readFirstCandle(symbol)
  if (!firstCandle) return
  const firstCandleTime = firstCandle.start
  if (firstCandleTime.getTime() < until.getTime()) return

  //logger.info(`Loading candles since ${lastCandleTime} for ${symbol}`);
  const candles = await okxClient.getHistoricCandles(symbol, '1m', {
    after: firstCandleTime.getTime() + '',
  })

  if (!candles || candles.length === 0) return
  candles.sort((a, b) => +a[0] - +b[0])

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
    .filter(({ start }) => start.getTime() < firstCandleTime.getTime())

  if (data.length) {
    logger.info(`Writing ${data.length} candles for ${symbol}`)
    await mongo.writeMany(symbol, data)
  }
}

async function main() {
  const markets = await okxClient.getTickers('SWAP')
  let symbols = markets.map((market) => market.instId).filter((symbol) => !symbol.endsWith('-USD-SWAP'))
  if (config.OKX_ENABLED_PAIRS && config.OKX_ENABLED_PAIRS.length)
    symbols = symbols.filter((symbol) => config.OKX_ENABLED_PAIRS.includes(symbol))

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
        await sleep(1000)
      }
    }

    runChunks()
  }

  runChunks()
}

main()
