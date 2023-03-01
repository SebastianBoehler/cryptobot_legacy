"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
//import sql from '../mysql/index.js'
const utils_1 = require("./utils");
//const sqlClient = new sql('storage');
const ftx_api_1 = require("ftx-api");
const wsFtx = new ftx_api_1.WebsocketClient({
    key: process.env.FTX_KEY,
    secret: process.env.FTX_SECRET,
});
wsFtx.subscribe({
    channel: 'ticker',
    market: 'BTC-PERP'
});
//let tickerData: TickerUpdate
let subscribed = [];
wsFtx.on('update', msg => {
    if ((0, ftx_api_1.isWsSubscribedEvent)(msg)) {
        if (msg['type'] === 'subscribed')
            subscribed.push(msg);
        else
            subscribed = subscribed.filter(e => e['channel'] !== msg['channel'] && e['market'] !== msg['market']);
        return;
    }
    if ((0, ftx_api_1.isWsTradesEvent)(msg))
        return;
    //if (msg['channel'] === 'ticker') tickerData = msg
});
init();
async function init() {
    //const transactions = await sqlClient.loadTransactions('trader')
    const acc = await (0, utils_1.getAccount)();
    const { takerFee, username } = acc;
    if (!username)
        throw 'failed to login';
    console.log(`Logged into ${username}. Total Acc Value: ${acc['totalAccountValue'].toFixed(2)}$`);
    process.env.FTX_FEE = takerFee + '';
    main();
}
async function main() {
}
//# sourceMappingURL=trader.js.map