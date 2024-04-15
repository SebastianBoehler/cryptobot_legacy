
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
    {
      name: 'worker',
      script: './build/worker.js',
      env_prod: {
        NODE_ENV: "prod",
      },
      watch: true,
      log_date_format,
      autorestart: false,
      //every 15min
      cron_restart: "*/15 * * * *"
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
        START_CAPITAL: 120,
        EXCHANGE: 'bybit',
        LOG_LEVEL: 'debug'
      },
      watch: false,
      log_date_format
    },
    {
      name: 'bybit_trader_wif',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'WIFUSDT',
        STRATEGY: 'SCALP_TEST',
        MULTIPLIER: 0.95,
        START_CAPITAL: 100,
        EXCHANGE: 'bybit',
        LOG_LEVEL: 'debug'
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
        STRATEGY: 'BUILD_SCALP_FAST',
        MULTIPLIER: 0.95,
        START_CAPITAL: 100,
        EXCHANGE: 'bybit',
        LOG_LEVEL: 'debug'
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
        START_CAPITAL: 100,
        EXCHANGE: 'bybit',
        LOG_LEVEL: 'debug'
      },
      watch: false,
      log_date_format
    },
    {
      name: 'bybit_trader_gpt',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'GPTUSDT',
        STRATEGY: 'SCALP_ALTS',
        MULTIPLIER: 0.95,
        START_CAPITAL: 70,
        EXCHANGE: 'bybit',
        LOG_LEVEL: 'debug'
      },
      watch: false,
      log_date_format
    },
    {
      name: 'bybit_trader_arkm',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'ARKMUSDT',
        STRATEGY: 'SCALP_ALTS',
        MULTIPLIER: 0.95,
        START_CAPITAL: 80,
        EXCHANGE: 'bybit',
        LOG_LEVEL: 'debug'
      },
      watch: false,
      log_date_format
    },
    //HB CAPITAL
    //INJECTIVE
    {
      name: 'hb_trader_ordi',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'ORDI-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 200,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_tia',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'TIA-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 350,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_fet',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'FET-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 350,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_ar',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'AR-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 700,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_rndr',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'RNDR-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 600,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_sol',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'SOL-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 1400,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    // {
    //   name: 'hb_trader_op',
    //   script: traderPath,
    //   //out_file: "/dev/null", //disable logs from being written to file
    //   env_prod: {
    //     NODE_ENV: "prod",
    //     SYMBOL: 'OP-USDT-SWAP',
    //     STRATEGY: 'BUILD_SCALP_FAST',
    //     START_CAPITAL: 250,
    //     MULTIPLIER: 0.95,
    //     EXCHANGE: 'okx',
    //   },
    //   watch: false
    // },
    {
      name: 'hb_trader_jup',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'JUP-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 500,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_bonk',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'BONK-USDT-SWAP',
        STRATEGY: 'INDICATORS',
        START_CAPITAL: 200,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_avax',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'AVAX-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 100,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_pyth',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'PYTH-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 350,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_front',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'FRONT-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 120,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_link',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'LINK-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 250,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_ftm',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'FTM-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 350,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_floki',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'FLOKI-USDT-SWAP',
        STRATEGY: 'SCALP_TEST',
        START_CAPITAL: 150,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_rsr',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'RSR-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 250,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_core',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'CORE-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 250,
        MULTIPLIER: 0.95,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
  ],
}
