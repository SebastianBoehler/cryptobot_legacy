
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
        MULTIPLIER: 0.88,
        STEPS: 2,
        STOP_LOSS: -25,
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
        STRATEGY: 'SCALP_ALTS',
        MULTIPLIER: 0.85,
        STEPS: 2,
        STOP_LOSS: -21,
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
        STRATEGY: 'SCALP_ALTS',
        MULTIPLIER: 0.93,
        STEPS: 2,
        STOP_LOSS: -19,
        LEVER_REDUCE: -12,
        START_CAPITAL: 100,
        EXCHANGE: 'bybit',
        LOG_LEVEL: 'debug'
      },
      watch: false,
      log_date_format
    },
    {
      name: 'bybit_trader_popcat',
      script: traderPath,
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'POPCATUSDT',
        STRATEGY: "BUILD_SCALP_FAST",
        MULTIPLIER: 0.87,
        STEPS: 2,
        STOP_LOSS: -10,
        LEVER_REDUCE: -7,
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
        MULTIPLIER: 0.9,
        STEPS: 2,
        STOP_LOSS: -17,
        LEVER_REDUCE: -5,
        START_CAPITAL: 80,
        EXCHANGE: 'bybit',
        LOG_LEVEL: 'debug'
      },
      watch: false,
      log_date_format
    },
    //HB CAPITAL
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
        MULTIPLIER: 0.94,
        STEPS: 10,
        STOP_LOSS: -28,
        LEVER_REDUCE: -8,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_turbo',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'TURBO-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 120,
        MULTIPLIER: 0.95,
        STEPS: 5,
        STOP_LOSS: -18,
        LEVER_REDUCE: -16,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_velo',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'VELO-USDT-SWAP',
        STRATEGY: 'INDICATORS',
        START_CAPITAL: 100,
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
        START_CAPITAL: 720,
        MULTIPLIER: 0.94,
        STEPS: 2,
        STOP_LOSS: -19,
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
        START_CAPITAL: 1600,
        MULTIPLIER: 0.85,
        STOP_LOSS: -11,
        STEPS: 5,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_ygg',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'YGG-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 120,
        MULTIPLIER: 0.94,
        STEPS: 2,
        STOP_LOSS: -18,
        LEVER_REDUCE: -13,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
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
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 200,
        MULTIPLIER: 0.93,
        STEPS: 3,
        STOP_LOSS: -12,
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
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 100,
        MULTIPLIER: 0.93,
        STEPS: 2,
        STOP_LOSS: -29,
        LEVER_REDUCE: -10,
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
        STEPS: 7,
        STOP_LOSS: -17,
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
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 150,
        MULTIPLIER: 0.87,
        STEPS: 2,
        STOP_LOSS: -19,
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
        STEPS: 3,
        STOP_LOSS: -24,
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
        START_CAPITAL: 320,
        MULTIPLIER: 0.96,
        STEPS: 5,
        STOP_LOSS: -13,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
    {
      name: 'hb_trader_stx',
      script: traderPath,
      //out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'STX-USDT-SWAP',
        STRATEGY: 'SCALP_ALTS',
        START_CAPITAL: 120,
        MULTIPLIER: 0.97,
        STEPS: 3,
        STOP_LOSS: -24,
        LEVER_REDUCE: -8,
        EXCHANGE: 'okx',
        LOG_LEVEL: 'debug'
      },
      watch: false
    },
  ],
}
