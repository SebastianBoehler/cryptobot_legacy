module.exports = {
    apps: [{
        name: "ftx_database",
        script: "./build/ftx/database.js",
        env: {
            NODE_ENV: "prod"
        },
        watch: true
    },
    {
        name: "ftx_backtester",
        script: "./build/ftx/backtester.js",
        env: {
            NODE_ENV: "prod"
        },
        watch: true
    },
    {
        name: "server",
        script: "./build/server.js",
        env: {
            NODE_ENV: "prod"
        },
        watch: true
    }
    ]
}