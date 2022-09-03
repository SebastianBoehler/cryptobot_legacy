import * as dotenv from 'dotenv';
const path = process.env.NODE_ENV || 'prod'

dotenv.config({
    path: `${path.split(' ').join('')}.env`
});

console.log('env',process.env.NODE_ENV)
//import './test'