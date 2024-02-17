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
    //PERSONAL OKX SUB ACC
    {
      name: 'okx_trader_sol',
      script: './build/okx/trader.js',
      out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'SOL-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 400,
      },
      watch: false
    },
    {
      name: 'okx_trader_tia',
      script: './build/okx/trader.js',
      out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'TIA-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    {
      name: 'okx_trader_ordi',
      script: './build/okx/trader.js',
      out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "prod",
        SYMBOL: 'ORDI-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95
      },
      watch: false
    },
    //HB CAPITAL
    {
      name: 'hb_trader_tia',
      script: './build/okx/trader.js',
      out_file: "/dev/null", //disable logs from being written to file
      env_prod: {
        NODE_ENV: "hb",
        SYMBOL: 'TIA-USDT-SWAP',
        STRATEGY: 'BUILD_SCALP_FAST',
        START_CAPITAL: 80,
        MULTIPLIER: 0.95,
      },
      watch: false
    },
  ],
}
