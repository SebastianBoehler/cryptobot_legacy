import express, { Express } from 'express';
import cors from 'cors';
import fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({
    path: `${process.env.NODE_ENV?.split(' ').join('')}.env`
});

const server: Express = express();
const port = process.env.PORT || 3001;

import ftxRoutes from './ftx/routes';
import mongoRoutes from './mongodb/routes';
import { logger } from './utils';
import https from 'https';

server.use(cors())
server.use(express.json());

const middleware = (req: Request, res: any, next: any) => {
    logger.http(`Received ${req.method} request for ${req.url}`);
    //const cacheInSeconds = 30
    //res.set('Cache-control', `public, max-age=${cacheInSeconds}`)
    next();
};

server.use(middleware);

server.use('/ftx', ftxRoutes);
server.use('/mongodb', mongoRoutes);

https.createServer(
    {
        key: fs.readFileSync('key.pem'),
        cert: fs.readFileSync('cert.pem')
    },
    server
).listen(port, () => {
    logger.info(`Server listening on port ${port}`);
});