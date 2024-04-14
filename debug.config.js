
const traderPath = './build/trader.js'
const log_date_format = 'YYYY-MM-DD HH:mm:ss'
module.exports = {
  apps: [
    {
      name: 'debug_trader',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'DOGE-USDT-SWAP',
        STRATEGY: 'TESTING',
        START_CAPITAL: 50,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
  ],
}
