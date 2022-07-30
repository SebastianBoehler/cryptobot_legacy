import * as dotenv from 'dotenv';
dotenv.config({
    path: `${process.env.NODE_ENV?.split(' ').join('')}.env`
});

//import './test'
import './ftx/writeCandles'