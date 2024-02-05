module.exports = {
  apps: [{
    name: "dydx_database",
    script: "./build/dydx/database.js",
    env_prod: {
      NODE_ENV: "prod"
    },
    env_dev: {
      NODE_ENV: "dev"
    },
    watch: true
  },
  {
    name: "okx_database",
    script: "./build/okx/database.js",
    env_prod: {
      NODE_ENV: "prod"
    },
    env_dev: {
      NODE_ENV: "dev"
    },
    watch: true
  },
  {
    name: "server",
    script: "./build/server.js",
    env_prod: {
      NODE_ENV: "prod",
      PORT: 80
    },
    env_dev: {
      NODE_ENV: "dev"
    },
    watch: true,
    exec_mode: "cluster",
    instances: "max",
  },
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
    name: 'okx_trader_sol',
    script: './build/okx/trader.js',
    env_prod: {
      NODE_ENV: "prod",
      SYMBOL: 'TIA-USDT-SWAP',
      START_CAPITAL: 50,
    },
    watch: false
  }
  ],
}
