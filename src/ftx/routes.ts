import express, { Request, Response } from 'express';
const router = express.Router();
import { getMarkets } from './utils';
import { generateIndicators } from '../generateIndicators';
import mysql from '../mysql';

const sqlClientStorage = new mysql('storage');
const ftxStorage = new mysql('ftx');

router.get('/ping', (req: Request, res: Response) => {
    res.send('pong');
});

router.get('/overview', async (req: Request, res: Response) => {
    const markets = await getMarkets()
    const futures = markets.filter(item => item['futureType'] === 'perpetual' && item['enabled'])
    const obj: {[key: string]: any} = {}

    for (const market of futures) {
        const symbol = market.name
        const [indicators25min ,indicators60min] = await Promise.all([
            generateIndicators(symbol, 25, new Date().getTime()),
            generateIndicators(symbol, 60, new Date().getTime())
        ])

        console.log(indicators25min)

        obj[symbol] = {
            long: {
                main: {
                    '60m MACD histogram': indicators60min['MACD']['histogram']! > 0
                },
                optional: {
                    '60m RSI': indicators60min['RSI'] < 75
                }
            },
        }
    }

    res.send(markets)
})

router.get('/transactions', async (req: Request, res: Response) => {
    const transactions = await sqlClientStorage.loadTransactions('backtester')
    res.send(transactions)
})

router.post('priceHistory', async (req: Request, res: Response) => {
    const { symbol, timestamp} = req.body
    const string = ` WHERE time > ${timestamp}`
    const history = await ftxStorage.getPriceHistory(symbol, string, undefined, 'close, time')
    res.send(history)
})

export default router;