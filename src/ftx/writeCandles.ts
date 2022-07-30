import {
    RestClient,
} from 'ftx-api'
import {
    Market,
    HistoricalPrice
} from '../types/ftx';
import mysql from '../mysql/index';

const FTXClient = new RestClient('AYCUnemwv-b9j1LnOhKYSRIM9-qgwSb-WKDm5cEI', 'ywNqtvLFNtUcukFjIE6TBKD8MgNp8oqr7CRkttfx');
const mysqlClient = new mysql('ftx');

async function main() {
    console.log(new Date().toLocaleString())
    const respMarkets: {
        result: Market[],
        success: boolean,
    } = await FTXClient.getMarkets();
    const markets = respMarkets['result'].filter((item: Market) => item['futureType'] === 'perpetual')
    const symbols = [...new Set(markets.map((item: Market) => item['name']))]

    let promises: Promise<void>[] = []

    for (const symbol of symbols) {
        promises.push(refreshData(symbol))
    }

    await Promise.all(promises)
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

    const respHistorical: {
        result: HistoricalPrice[],
        success: boolean,
    } = await FTXClient.getHistoricalPrices({
        market_name: symbol,
        resolution: 60,
        start_time: startTime.getTime() / 1000,
    })
    .catch(e => {
        return {
            result: [],
            success: false,
        }
    })

    if (!respHistorical['success']) return

    let historical = respHistorical['result']
    if (historical[historical.length - 1]['time'] === latestTime) return

    historical = historical.filter((item) => item['time'] > latestTime)

    for (let priceObj of historical) {
        await mysqlClient.pushNewPriceData(symbol, priceObj)
    }
}

main()