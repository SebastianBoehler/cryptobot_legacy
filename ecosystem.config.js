module.exports = {
  apps: [
    // {
    //   name: "okx_database",
    //   script: "./build/okx/database.js",
    //   env_prod: {
    //     NODE_ENV: "prod"
    //   },
    //   env_dev: {
    //     NODE_ENV: "dev"
    //   },
    //   watch: true
    // },
    {
      name: 'okx_trader_sol',
      script: './build/okx/trader.js',
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'SOL-USDT-SWAP',
        START_CAPITAL: 400,
      },
      watch: false
    },
    {
      name: 'okx_trader_tia',
      script: './build/okx/trader.js',
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'TIA-USDT-SWAP',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95
      },
      watch: false
    }
  ],
}
