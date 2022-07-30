import sql from './mysql/index'

console.log(process.env.TEST, 'das ist immernoch test');

const mysql = new sql('ftx');

(async () => {
    const data = await mysql.priceHistory('BTCPERP');
    console.log(data)
})()