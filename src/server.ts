import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import rateLimit from 'express-rate-limit'

dotenv.config({
    path: `${process.env.NODE_ENV?.split(' ').join('')}.env`
});

const server: Express = express();
const port = process.env.PORT || 3001;

import ftxRoutes from './ftx/routes';
import mongoRoutes from './mongodb/routes';
import { logger } from './utils';

server.use(cors())
server.use(express.json());

const middleware = (req: Request, res: Response, next: any) => {
    logger.http(`Received ${req.method} request for ${req.url} from ${req}`);
    const cacheInSeconds = 30
    res.set('Cache-control', `public, max-age=${cacheInSeconds}`)
    next();
};

server.use(middleware);

server.use('/ftx', ftxRoutes);
server.use('/mongodb', mongoRoutes);

const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})

server.use(limiter);

server.get('*', (_req: Request, res: Response) => {
    res.status(404).send({
        message: 'Not found'
    });
});

server.post('*', (_req: Request, res: Response) => {
    res.status(404).send({
        message: 'Not found'
    });
});

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});