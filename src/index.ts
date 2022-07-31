import * as dotenv from 'dotenv';
dotenv.config({
    path: `${process.env.NODE_ENV?.split(' ').join('')}.env`
});

console.log('env',process.env.NODE_ENV)
//import './test'