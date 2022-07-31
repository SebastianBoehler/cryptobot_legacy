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
    const markets = allMarkets.filter((item: Market) => item['futureType'] === 'perpetual')
    const symbols = [...new Set(markets.map((item: Market) => item['name']))]

    await Promise.all(symbols.map(refreshData))
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
    startTime.setMinutes(startTime.getMinutes() - 3)

    let historical = await getHistoricalPrices(symbol, startTime.getTime() / 1000)
    if (historical[historical.length - 1]['time'] === latestTime) return

    historical = historical.filter((item) => item['time'] > latestTime)

    console.log('write new data', symbol, historical.length)
    for (let priceObj of historical) {
        await mysqlClient.pushNewPriceData(symbol, priceObj)
    }
}