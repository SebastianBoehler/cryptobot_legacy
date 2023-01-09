import { getUnixTime } from 'date-fns';
import ws from 'ws';
import Coinbase from './utils';

const api_key = 'ydwavigCDdPDBMWG'
const myCoinbase = new Coinbase(api_key)

const client = new ws('wss://advanced-trade-ws.coinbase.com', {
    //increase receive buffer to max
    maxPayload: 1000000000,
});

client.on('ping', () => {
    client.send('pong')
})

client.on('open', async () => {
    console.log(`ws open`)
    const products = await myCoinbase.listProducts();
    const product_ids = products.map((product: any) => product.product_id).slice(0,1)
    const channel = 'ticker_batch'

    console.log(product_ids)
    const timestamp = getUnixTime(Date.now())

    const string = timestamp + channel + product_ids.join(',')
    const signature = myCoinbase.createSignature(string)

    const subscribe = {
        type: 'subscribe',
        product_ids,
        channel,
        api_key,
        timestamp,
        signature
    }

    client.send(JSON.stringify(subscribe))
})

client.on('message', (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.type === 'ticker') {
        console.log(data)
    } else if (data.type === 'error') {
        console.error(data)
    }
})