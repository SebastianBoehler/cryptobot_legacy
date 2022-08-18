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
        side: 'sell',
        price: null,
        type: 'market',
        size: 0.001,
    })
    await sleep(1000 * 2)
    const entryFills = await FTXClient.getFills({
        orderId: buy['result']['id']
    })

    console.log('entryFills', entryFills['result'].length)
    await sleep(1000 * 30)

    const sell = await FTXClient.placeOrder({
        market,
        side: 'buy',
        price: null,
        type: 'market',
        size: 1,
        reduceOnly: true,
    })
    await sleep(1000 * 2)
    const exitFills = await FTXClient.getFills({
        orderId: sell['result']['id']
    })
    console.log('exitFills', exitFills['result'].length)

    const fees = [
        ...entryFills['result'].map((item: any) => item['fee']),
        ...exitFills['result'].map((item: any) => item['fee']),
    ]
    const feeSum = fees.reduce((acc: number, item: number) => acc + item, 0)

    console.log('fees', fees, feeSum)

    const entry = {
        type: 'Short Entry',
        price: entryFills['result'][0]['price'],
        invest: entryFills['result'][0]['size'] * entryFills['result'][0]['price'],
        fee: entryFills['result'][0]['fee'],
        feeRate: entryFills['result'][0]['feeRate'],
        size: entryFills['result'][0]['size'],
    }

    const profit = await calculateProfit(entry, exitFills['result'][0]['price'])

    const exit = {
        type: 'Short Exit',
        price: exitFills['result'][0]['price'],
        invest: profit['netInvest'],
        fee: exitFills['result'][0]['fee'],
        feeRate: exitFills['result'][0]['feeRate'],
        size: exitFills['result'][0]['size'],
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