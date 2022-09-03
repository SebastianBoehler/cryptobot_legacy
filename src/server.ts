import express, { Express } from 'express';
import * as dotenv from 'dotenv';
dotenv.config({
    path: `${process.env.NODE_ENV?.split(' ').join('')}.env`
});

const server: Express = express();
const port = process.env.PORT || 3000;

import ftxRoutes from './ftx/routes';

server.use('/ftx', ftxRoutes);

server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});