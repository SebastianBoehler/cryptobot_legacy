import ws from 'ws';
import Coinbase from './utils';

const myCoinbase = new Coinbase('ydwavigCDdPDBMWG')

const client = new ws('wss://advanced-trade-ws.coinbase.com');

client.on('open', async () => {
    console.log('open')
    const products = await myCoinbase.listProducts();
    const productIds = products.map((product: any) => product.id);

    const subscribe = {
        type: 'subscribe',
        product_ids: productIds,
        channels: ['ticker'],
    }

    client.send(JSON.stringify(subscribe))
})

client.on('message', (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.type === 'ticker') {
        console.log(data)
    }
})