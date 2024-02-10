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
        STRATEGY: 'SCALP_INDICATORS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    {
      name: 'okx_trader_pyth',
      script: './build/okx/trader.js',
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'PYTH-USDT-SWAP',
        STRATEGY: 'SCALP_INDICATORS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    {
      name: 'okx_trader_sui',
      script: './build/okx/trader.js',
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'SUI-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    {
      name: 'okx_database',
      script: './build/okx/database.js',
      env_prod: {
        NODE_ENV: "prod"
      },
      watch: true
    },
    //HB CAPITAL
    {
      name: 'hb_trader_tia',
      script: './build/okx/trader.js',
      env_prod: {
        NODE_ENV: "hb",
        SYMBOL: 'TIA-USDT-SWAP',
        STRATEGY: 'SCALP_INDICATORS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
      },
      watch: false
    },
    {
      name: 'hb_trader_pyth',
      script: './build/okx/trader.js',
      env_prod: {
        NODE_ENV: "hb",
        SYMBOL: 'PYTH-USDT-SWAP',
        STRATEGY: 'SCALP_INDICATORS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
      },
      watch: false
    },
  ],
}
