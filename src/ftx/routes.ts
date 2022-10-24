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
    const sorted = futures.sort((a, b) => b['volumeUsd24h'] - a['volumeUsd24h']).slice(0, 8)
    const obj: {[key: string]: any} = {}

    for (const market of sorted) {
        try {
            const symbol = market.name
            console.log(symbol)
            const [indicators25min, indicators60min] = await Promise.all([
                generateIndicators(symbol, 25, new Date().getTime()),
                generateIndicators(symbol, 60, new Date().getTime())
            ])

            if (!indicators25min || !indicators60min) continue

            console.log(indicators25min)

            obj[symbol] = {
                long: {
                    main: [
                        {
                            key: '60m MACD histogram',
                            val: indicators60min['MACD']['histogram']! > 0
                        }
                    ],
                    optional: [
                        {
                            key: '60m RSI',
                            val: indicators60min['RSI'] > 50
                        }
                    ]
                },
            }
        } catch (error) {
            continue
        }
    }

    res.setHeader('Cache-Control', `s-maxage=${86400}`);
    res.send(obj)
})

router.get('/transactions', async (req: Request, res: Response) => {
    //url params
    const limit: number = +(req.query.limit as string)
    const id: number = +(req.query.id as string)
    const transactions = await sqlClientStorage.loadTransactions('backtester', limit, id)
    res.setHeader('Cache-Control', `s-maxage=${86400}`);
    res.send(transactions)
})

router.post('/priceHistory', async (req: Request, res: Response) => {
    if (!req.body) return res.status(400).send('No body')

    const { symbol, time } = req.body
    const string = ` WHERE time > ${time}`
    const history = await ftxStorage.getPriceHistory(symbol, string, undefined, 'close, time')
    res.send(history)
})

export default router;