"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_extended_1 = __importDefault(require("dotenv-extended"));
const dotenv_parse_variables_1 = __importDefault(require("dotenv-parse-variables"));
const options = {
    silent: false,
    defaults: "./src/config/.env.defaults",
    schema: "./src/config/.env.schema",
    path: `./src/config/.env.${process.env.NODE_ENV?.split(" ").join("")}`,
    includeProcessEnv: true,
    assignToProcessEnv: true,
    overrideProcessEnv: false,
};
const env = dotenv_extended_1.default.load(options);
const parsedConfig = (0, dotenv_parse_variables_1.default)(env);
const config = {
    //FTX
    FTX_KEY: parsedConfig.FTX_KEY,
    FTX_SECRET: parsedConfig.FTX_SECRET,
    FTX_FEE: parsedConfig.FTX_FEE,
    //BINANCE
    BINANCE_API_KEY: parsedConfig.BINANCE_API_KEY,
    BINANCE_API_SECRET: parsedConfig.BINANCE_API_SECRET,
    BN_ENABLED_PAIRS: parsedConfig.BN_ENABLED_PAIRS,
    //COINBASE
    CB_API_KEY: parsedConfig.CB_API_KEY,
    CB_ENABLED_PAIRS: parsedConfig.CB_ENABLED_PAIRS,
    //DYDX
    DYDX_ENABLED_PAIRS: parsedConfig.DYDX_ENABLED_PAIRS,
    //DATABASE
    WRITE_TO_DB: parsedConfig.WRITE_TO_DB,
    MONGO_URL: parsedConfig.MONGO_URL,
    //TRADING
    LEVERAGE: parsedConfig.LEVERAGE,
    //Back testing
    START_INDEX: parsedConfig.START_INDEX,
    //NODE defaults
    NODE_ENV: parsedConfig.NODE_ENV,
    LOG_LEVEL: parsedConfig.LOG_LEVEL,
    //deprecated
    SQL_USER: parsedConfig.SQL_USER,
    SQL_PASSWORD: parsedConfig.SQL_PASSWORD,
    SQL_HOST: parsedConfig.SQL_HOST,
    EXCHANGE: "",
    SQL_PORT: null,
};
exports.default = config;
//# sourceMappingURL=config.js.map