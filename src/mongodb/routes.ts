import express, { Request, Response } from 'express';
import { timeKey as timeKeyBinance } from '../binance/utils';
import { timeKey as timeKeyCoinbase } from '../coinbase/utils';
import { timeKey as timeKeyDydx } from '../dydx/utils';
const router = express.Router();
import mongo from './index';
const client = new mongo('admin');

const cacheInSeconds = 60
router.get('/databases', async (req: Request, res: Response) => {
    const databases = await client.listDatabases();
    res.set('Cache-control', `public, max-age=${cacheInSeconds}`)
    res.send(databases);
});

router.get('/collections/:database', async (req: Request, res: Response) => {
    const { database } = req.params;
    if (!database) {
        res.status(400).send('database query parameter is required');
        return;
    }
    const collections = await client.existingCollections(database);
    res.set('Cache-control', `public, max-age=${cacheInSeconds}`)
    res.json(collections);
});

router.get('/timeframe/:database/:collection', async (req: Request, res: Response) => {
    const { database, collection } = req.params;
    if (!database) {
        res.status(400).send('database query parameter is required');
        return;
    }

    let _timeKey = 'start'
    switch(database) {
        case 'binance':
            _timeKey = timeKeyBinance
            break;
        case 'coinbase':
            _timeKey = timeKeyCoinbase
            break;
        case 'dydx':
            _timeKey = timeKeyDydx
            break;
    }

    const result = await client.getStartAndEndDates(database, collection, _timeKey);
    res.json(result);
});

export default router;