import {
    Market,
} from '../types/ftx';
import mysql from '../mysql/index';
import { getMarkets, getHistoricalPrices } from './utils';

const mysqlClient = new mysql('ftx');

process.on('unhandledRejection', () => {
    console.error('unhandledRejection')
    process.exit(1)
})

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
        const result = await Promise.allSettled(symbols.map(refreshData))
    } catch (error) {
        console.error(error)
        console.error('Promise all failed')
    }
    console.log('done')
    main()
}

async function refreshData(symbol: string) {
    const latestTime = await mysqlClient.getLastPriceTimestamp(symbol)
    .catch(async e => {
        if (e.message.includes('ER_NO_SUCH_TABLE')) {
            await mysqlClient.createTable(symbol, [
                'id int auto_increment primary key', 
                'time VARCHAR(255)', 
                'open VARCHAR(255)', 
                'close VARCHAR(255)', 
                'high VARCHAR(255)', 
                'low VARCHAR(255)', 
                'volume VARCHAR(255)', 
                'price VARCHAR(255)',
                'bid VARCHAR(255)',
                'ask VARCHAR(255)',
            ])
        }
        else if (e.code !== 'POOL_ENQUEUELIMIT') console.error('unable to get latest time', e)
        return 0
    })
    //console.log(latestTime, new Date(latestTime).toLocaleString())

    const minAgo = new Date()
    minAgo.setSeconds(minAgo.getSeconds() - 61)

    if (latestTime > minAgo.getTime()) return

    const startTime = new Date()
    startTime.setMinutes(startTime.getMinutes() - 4)

    let historical = await getHistoricalPrices(symbol, startTime.getTime() / 1000)
    .catch(e => {
        console.error(e)
        console.error('unable to get historical prices')
        return undefined
    })
    if (!historical || historical[historical.length - 1]['time'] === latestTime) return

    const currentMin = new Date().getMinutes()

    historical = historical.filter((item) => item['time'] > latestTime && new Date(item['time']).getMinutes() !== currentMin)

    console.log('write new data', symbol, historical.length)
    for (let priceObj of historical) {
        await mysqlClient.pushNewPriceData(symbol, priceObj)
    }
}