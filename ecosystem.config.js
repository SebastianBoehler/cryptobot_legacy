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
    deploy: {
        prod: {
            user: "root",
            host: "localhost",
            ref: "origin/main",
            repo: "git@github.com:SebastianBoehler/cryptobot3.0.git",
            path: "/root/cryptobot3.0",
            "post-deploy": "npm run pm2:restart"
        }
    }
}