import Coinbase from './utils';
import Mongo from '../mongodb'
import { addMinutes, getUnixTime } from 'date-fns';
import { createChunks, logger, sleep } from '../utils';

const startTime = new Date('2022-10-01').getTime()
const api_key = 'ydwavigCDdPDBMWG'
const client = new Coinbase(api_key)
const mongo = new Mongo('coinbase')

async function main() {
    //const products = await client.listProducts()

    const symbols: string[] = ['BTC-USD'] //products.map((product: any) => product.product_id)

    const chunks = createChunks(symbols, 2)

    while (true) {
        for (const chunk of chunks) {
            try {
                await Promise.all(chunk.map(processSymbol))
                //logger.info(`Successfully updated ${result.filter((r) => r.status === 'fulfilled').length} symbols`)
            } catch (error: unknown) {
                logger.error(error)
            } finally {
                await sleep(1000 * 5)
            }
        }
    }
}

async function processSymbol(symbol: string) {
    const lastCandle = await mongo.readLastCandle(symbol) as unknown as {
        start: Date
        low: number
        high: number
        open: number
        close: number
        volume: number
    }

    logger.info('lastCandle', new Date(lastCandle ? addMinutes(lastCandle.start, 1) : startTime).toString(), lastCandle)
    const candles = await client.getKlines({
        symbol,
        interval: 'ONE_MINUTE',
        startTime: getUnixTime(lastCandle ? addMinutes(lastCandle.start, 1) : startTime),
        endTime: getUnixTime(lastCandle ? addMinutes(lastCandle.start, 101) : addMinutes(startTime, 100)),
    })

    if (!lastCandle) {
        logger.info(`Creating unique index for ${symbol}`)
        await mongo.createUniqueIndex(symbol, 'openTime')
    }

    logger.info(`Loaded ${candles.length} candles for ${symbol}`, new Date(+candles[0].start * 1000).toString())

    const formatted = candles
        .filter((item) => +item.start > getUnixTime(lastCandle.start))
        .map((candle: any) => {
            return {
                ...candle,
                start: new Date(candle.start * 1000),
            }
        })

    logger.info('formatted', formatted.length)
    if (formatted.length > 0) await mongo.writeMany(symbol, formatted)
}

main()