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
        watch: true
    },
    {
        name: "ftx_backtester",
        script: "./build/ftx/backtester.js",
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
            NODE_ENV: "prod"
        },
        env_dev: {
            NODE_ENV: "dev"
        },
        watch: true
    }
    ],
}