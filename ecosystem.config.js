module.exports = {
    apps: [{
        name: "ftx_database",
        script: "./build/ftx/database",
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
        script: "./build/ftx/backtester",
        env_prod: {
            NODE_ENV: "prod"
        },
        env_dev: {
            NODE_ENV: "dev"
        },
        watch: true
    }
    ]
}