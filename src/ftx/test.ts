import {
    RestClient,
} from 'ftx-api'
import * as dotenv from 'dotenv';
import { calculateProfit } from './utils';
dotenv.config({
    path: `${process.env.NODE_ENV?.split(' ').join('')}.env`
});
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const FTXClient = new RestClient(process.env.FTX_KEY, process.env.FTX_SECRET);

(async () => {
    const market = 'BTC-PERP'
    let balance = await FTXClient.getBalances()
    let usdBalance = balance.result.find(b => b.coin === 'USD')
    const prev = usdBalance!.total

    const buy = await FTXClient.placeOrder({
        market,
        side: 'buy',
        price: null,
        type: 'market',
        size: 0.001,
    })
    await sleep(1000 * 2)
    const buyFills = await FTXClient.getFills({
        orderId: buy['result']['id']
    })

    console.log('buyFills', buyFills['result'].length)
    await sleep(1000 * 5)

    const sell = await FTXClient.placeOrder({
        market,
        side: 'sell',
        price: null,
        type: 'market',
        size: 1,
        reduceOnly: true,
    })
    await sleep(1000 * 2)
    const sellFills = await FTXClient.getFills({
        orderId: sell['result']['id']
    })
    console.log('sellFills', sellFills['result'].length)

    const fees = [
        ...buyFills['result'].map((item: any) => item['fee']),
        ...sellFills['result'].map((item: any) => item['fee']),
    ]
    const feeSum = fees.reduce((acc: number, item: number) => acc + item, 0)

    console.log('fees', fees, feeSum)

    const entry = {
        type: 'Long Entry',
        price: buyFills['result'][0]['price'],
        invest: buyFills['result'][0]['size'] * buyFills['result'][0]['price'],
        fee: buyFills['result'][0]['fee'],
        feeRate: buyFills['result'][0]['feeRate'],
        size: buyFills['result'][0]['size'],
    }

    const profit = await calculateProfit(entry, sellFills['result'][0]['price'])

    const exit = {
        type: 'Long Exit',
        price: sellFills['result'][0]['price'],
        invest: profit['exitInvestSize'],
        fee: sellFills['result'][0]['fee'],
        feeRate: sellFills['result'][0]['feeRate'],
        size: sellFills['result'][0]['size'],
    }
    console.log(entry)
    console.log(exit)

    await sleep(1000 * 35)

    balance = await FTXClient.getBalances()
    usdBalance = balance.result.find(b => b.coin === 'USD')
    const after = usdBalance!.total

    console.log('priceChange', profit['priceChange'])
    console.log(after - prev)
    console.log(profit['netProfit'])

    console.log(profit['fee'], profit['feeSum'])
    console.log(profit['bruttoProfit'], feeSum, profit['bruttoProfit']! + -(feeSum))
})()
.catch(e => {
    console.error(e)
}) 