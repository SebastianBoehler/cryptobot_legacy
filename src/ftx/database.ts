import {
    Market,
} from '../types/ftx';
import mysql from '../mysql/index';
import { getMarkets, getHistoricalPrices } from './utils';

const mysqlClient = new mysql('ftx');

main()
.catch(e => {
    console.error(e)
})
async function main() {
    console.log(new Date().toLocaleString())
    const allMarkets = await getMarkets()
    .catch(e => {
        console.error(e)
        console.error('unabled to get markets')
        return []
    })
    const markets = allMarkets.filter((item: Market) => item['futureType'] === 'perpetual')
    const symbols = [...new Set(markets.map((item: Market) => item['name']))]

    try {
        await Promise.all(symbols.map(refreshData))
    } catch (error) {
        console.error(error)
        console.error('Promise all failed')
    }
    console.log('done')
    main()
}

async function refreshData(symbol: string) {
    const latestTime = await mysqlClient.getLastPriceTimestamp(symbol)
    //console.log(latestTime, new Date(latestTime).toLocaleString())

    const minAgo = new Date()
    minAgo.setSeconds(minAgo.getSeconds() - 61)

    if (latestTime > minAgo.getTime()) return

    const startTime = new Date()
    startTime.setMinutes(startTime.getMinutes() - 4)

    let historical = await getHistoricalPrices(symbol, startTime.getTime() / 1000)
    if (historical[historical.length - 1]['time'] === latestTime) return

    const currentMin = new Date().getMinutes()

    historical = historical.filter((item) => item['time'] > latestTime && new Date(item['time']).getMinutes() !== currentMin)

    console.log('write new data', symbol, historical.length)
    for (let priceObj of historical) {
        await mysqlClient.pushNewPriceData(symbol, priceObj)
    }
}