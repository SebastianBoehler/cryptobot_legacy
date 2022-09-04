import express, { Request, Response } from 'express';
const router = express.Router();
import { getMarkets } from './utils';
import { generateIndicators } from '../generateIndicators';

router.get('/ping', (req: Request, res: Response) => {
    res.send('pong');
});

router.get('/dev', async (req: Request, res: Response) => {
    const markets = await getMarkets()
    const futures = markets.filter(item => item['futureType'] === 'perpetual' && item['enabled'])
    const obj: {[key: string]: any} = {}

    for (const market of futures) {
        const symbol = market.name
        const [indicators25min ,indicators60min] = await Promise.all([
            generateIndicators(symbol, 25, new Date().getTime()),
            generateIndicators(symbol, 60, new Date().getTime())
        ])

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

export default router;