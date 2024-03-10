module.exports = {
  apps: [
    //SYSTEM
    {
      name: 'okx_database',
      script: './build/okx/database.js',
      out_file: "/dev/null", //disable logs from being written to file
      //error_file: "/dev/null"
      env_prod: {
        NODE_ENV: "prod"
      },
      watch: true
    },
    {
      name: 'server',
      script: './build/server.js',
      out_file: "/dev/null", //disable logs from being written to file
      //error_file: "/dev/null"
      env_prod: {
        NODE_ENV: "prod",
        PORT: 443
      },
      watch: true
    },
    //PERSONAL OKX SUB ACC
    {
      name: 'okx_trader_sol',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'SOL-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        MULTIPLIER: 0.95,
        START_CAPITAL: 400,
      },
      watch: false
    },
    {
      name: 'okx_trader_tia',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'TIA-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    {
      name: 'okx_trader_ordi',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'ORDI-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    {
      name: 'okx_trader_op',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'OP-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    {
      name: 'okx_trader_ar',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'AR-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 100,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    {
      name: 'okx_trader_fet',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'FET-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 120,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    {
      name: 'okx_trader_rndr',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'RNDR-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    {
      name: 'okx_trader_jup',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'JUP-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 100,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    {
      name: 'okx_trader_agix',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'AGIX-USDT-SWAP',
        STRATEGY: 'INDICATORS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    {
      name: 'okx_trader_bonk',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'BONK-USDT-SWAP',
        STRATEGY: 'INDICATORS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    //HB CAPITAL
    {
      name: 'hb_trader_ordi',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "hb",
        SYMBOL: 'ORDI-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
      },
      watch: false
    },
    {
      name: 'hb_trader_tia',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "hb",
        SYMBOL: 'TIA-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
      },
      watch: false
    },
    {
      name: 'hb_trader_fet',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "hb",
        SYMBOL: 'FET-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
      },
      watch: false
    },
    {
      name: 'hb_trader_ar',
      script: './build/okx/trader.js',
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "hb",
        SYMBOL: 'AR-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95
      },
      watch: false
    },
  ],
}
