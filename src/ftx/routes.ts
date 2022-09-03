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
        break
        const symbol = market.name
        const [indicators25min ,indicators60min] = await Promise.all([
            generateIndicators(symbol, 25, new Date().getTime()),
            generateIndicators(symbol, 60, new Date().getTime())
        ])

        obj[symbol] = {
            indicators25min,
            indicators60min
        }
    }

    res.send(markets)
})

export default router;