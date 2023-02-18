import { CandleResolution, DydxClient, Market } from '@dydxprotocol/v3-client'
import { subMonths } from 'date-fns';
import { createChunks, logger, sleep } from '../utils';
import config from '../config/config';
import Mongo from '../mongodb/index';
import { DatabaseType } from './types';
import { timeKey } from './utils';

const client = new DydxClient('https://api.dydx.exchange')
const startTime = subMonths(new Date(), 3).getTime();
const mongo = new Mongo('dydx')

async function main() {
    const { markets } = await client.public.getMarkets()
    const marketArray = Object.keys(markets)

    if (config.DYDX_ENABLED_PAIRS.length > 0) marketArray.filter((item) => config.DYDX_ENABLED_PAIRS.includes(item))

    const chunks = createChunks(marketArray, 5)

    while (true) {
        for (const chunk of chunks) {
            try {
                const result = await Promise.allSettled(chunk.map(processSymbol))
                logger.info(`Successfully updated ${result.filter((r) => r.status === 'fulfilled').length} symbols`)
            } catch (error: unknown) {
                logger.error(error)
            } finally {
                await sleep(1000)
            }
        }
        await sleep(1000 * 45)
    }
}

async function processSymbol(symbol: string) {
    const lastCandle = await mongo.readLastCandle(symbol, timeKey) as unknown as DatabaseType | null

    const lastCandleTime = lastCandle ? lastCandle.start : new Date(startTime)

    const { candles } = await client.public.getCandles({
        market: symbol as Market,
        resolution: CandleResolution.ONE_MIN,
        fromISO: new Date(lastCandleTime).toISOString(),
        toISO: new Date(lastCandleTime.getTime() + 1000 * 60 * 100).toISOString(),
    })

    if (!candles || candles.length === 0) return
    if (!lastCandle) {
        logger.info(`Creating unique index for ${symbol}`)
        await mongo.createUniqueIndex(symbol, 'start')
    }

    console.log(`Loaded ${candles.length} candles for ${symbol}`, lastCandle?.start)

    const formatted: DatabaseType[] = candles
        .map((candle) => {
            return {
                high: candle.high,
                low: candle.low,
                open: candle.open,
                close: candle.close,
                volume: candle.usdVolume,
                start: new Date(candle.startedAt),
            }
        })
        .filter((candle) => candle.start.getTime() > lastCandleTime.getTime())

    await mongo.writeMany(symbol, formatted)
}

main()