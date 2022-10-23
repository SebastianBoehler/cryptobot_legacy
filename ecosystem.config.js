module.exports = {
    apps: [{
        name: "ftx_database",
        script: "./build/ftx/database.js",
        env_prod: {
            NODE_ENV: "prod"
        },
        env_dev: {
            NODE_ENV: "dev"
        },
        watch: false
    },
    {
        name: "ftx_backtester_0",
        script: "./build/ftx/backtester.js",
        env_prod: {
            NODE_ENV: "prod",
            START_INDEX: 0
        },
        env_dev: {
            NODE_ENV: "dev",
            START_INDEX: 0
        },
        watch: false
    },
    {
        name: "ftx_backtester_1",
        script: "./build/ftx/backtester.js",
        env_prod: {
            NODE_ENV: "prod",
            START_INDEX: 10
        },
        env_dev: {
            NODE_ENV: "dev",
            START_INDEX: 10
        },
        watch: false
    },
    {
        name: "server",
        script: "./build/server.js",
        env_prod: {
            NODE_ENV: "prod"
        },
        env_dev: {
            NODE_ENV: "dev"
        },
        watch: false
    }
    ],
}