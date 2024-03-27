
const traderPath = './build/trader.js'
const log_date_format = 'YYYY-MM-DD HH:mm:ss'
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
      name: 'bybit_database',
      script: './build/bybit/database.js',
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
      watch: true,
      log_date_format,
    },
    //PERSOANL BYBIT ACC
    {
      name: 'bybit_trader_ondo',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'ONDOUSDT',
        STRATEGY: 'SCALP_ALTS',
        MULTIPLIER: 0.95,
        START_CAPITAL: 80,
        EXCHANGE: 'bybit',
      },
      watch: false,
      log_date_format
    },
    {
      name: 'bybit_trader_myro',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'MYROUSDT',
        STRATEGY: 'SCALP_BEAR',
        MULTIPLIER: 0.95,
        START_CAPITAL: 60,
        EXCHANGE: 'bybit',
      },
      watch: false,
      log_date_format
    },
    {
      name: 'bybit_trader_wen',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: '10000WENUSDT',
        STRATEGY: 'INDICATORS',
        MULTIPLIER: 0.95,
        START_CAPITAL: 60,
        EXCHANGE: 'bybit',
      },
      watch: false,
      log_date_format
    },
    {
      name: 'bybit_trader_inj',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'INJUSDT',
        STRATEGY: 'SCALP_BEAR',
        MULTIPLIER: 0.95,
        START_CAPITAL: 60,
        EXCHANGE: 'bybit',
      },
      watch: false,
      log_date_format
    },
    //PERSONAL OKX SUB ACC
    {
      name: 'okx_trader_sol',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'SOL-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        MULTIPLIER: 0.95,
        START_CAPITAL: 410,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_tia',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'TIA-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_ordi',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'ORDI-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_op',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'OP-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_ar',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'AR-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 100,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_fet',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'FET-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 140,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_rndr',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'RNDR-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 100,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_jup',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'JUP-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 100,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_agix',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'AGIX-USDT-SWAP',
        STRATEGY: 'INDICATORS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_bonk',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'BONK-USDT-SWAP',
        STRATEGY: 'INDICATORS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_avax',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'AVAX-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 180,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_pyth',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'PYTH-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 90,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_front',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'FRONT-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_id',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'ID-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_link',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'LINK-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 140,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'okx_trader_ftm',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'FTM-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    //HB CAPITAL
    {
      name: 'hb_trader_ordi',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "hb",
        SYMBOL: 'ORDI-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'hb_trader_tia',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "hb",
        SYMBOL: 'TIA-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'hb_trader_fet',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "hb",
        SYMBOL: 'FET-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'hb_trader_ar',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "hb",
        SYMBOL: 'AR-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'hb_trader_rndr',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "hb",
        SYMBOL: 'RNDR-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
    {
      name: 'hb_trader_sol',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "hb",
        SYMBOL: 'SOL-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 600,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
      },
      watch: false
    },
  ],
}
