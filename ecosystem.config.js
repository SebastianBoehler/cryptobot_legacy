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
    watch: false
  },
  {
    name: "coinbase_database",
    script: "./build/coinbase/database.js",
    env_prod: {
      NODE_ENV: "prod",
    },
    env_dev: {
      NODE_ENV: "dev",
    },
    //exec_mode: "cluster",
    //instances: "max",
    watch: false
  },
  {
    name: "binance_database",
    script: "./build/binance/database.js",
    env_prod: {
      NODE_ENV: "prod",
    },
    env_dev: {
      NODE_ENV: "dev",
    },
    //exec_mode: "cluster",
    //instances: "max",
    watch: false
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
    watch: false,
    exec_mode: "cluster",
    instances: "max",
  }],
}
