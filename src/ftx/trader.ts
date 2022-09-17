//import sql from '../mysql/index.js'
import { getAccount } from './utils';
//const sqlClient = new sql('storage');
import {
    isWsSubscribedEvent,
    isWsTradesEvent,
    WebsocketClient
} from 'ftx-api'
import { SubscribeEvent, TickerUpdate } from '../types/ftx';

const wsFtx = new WebsocketClient({
    key: process.env.FTX_KEY,
    secret: process.env.FTX_SECRET,
})

wsFtx.subscribe({
    channel: 'ticker',
    market: 'BTC-PERP'
})

let tickerData: TickerUpdate
let subscribed: SubscribeEvent[] = []
wsFtx.on('update', msg => {
    if (isWsSubscribedEvent(msg)) {
        if (msg['type'] === 'subscribed') subscribed.push(msg)
        else subscribed = subscribed.filter(e => e['channel'] !== msg['channel'] && e['market'] !== msg['market'])
        return
    }
    if (isWsTradesEvent(msg)) return

    if (msg['channel'] === 'ticker') tickerData = msg
})

init()
async function init() {
    //const transactions = await sqlClient.loadTransactions('trader')
    const acc = await getAccount()
    const { takerFee, username } = acc
    if (!username) throw 'failed to login'
    console.log(`Logged into ${username}. Total Acc Value: ${acc['totalAccountValue'].toFixed(2)}$`)
    process.env.FTX_FEE = takerFee + ''

    main()
}

async function main() {
}