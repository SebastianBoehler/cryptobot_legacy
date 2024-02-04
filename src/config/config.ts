import extendedEnv from 'dotenv-extended'
import dotenvParseVariables from 'dotenv-parse-variables'

const options = {
  silent: false,
  defaults: './src/config/.env.defaults',
  schema: './src/config/.env.schema',
  path: `./src/config/.env.${process.env.NODE_ENV?.split(' ').join('')}`,
  includeProcessEnv: true,
  assignToProcessEnv: true,
  overrideProcessEnv: false,
}

const env = extendedEnv.load(options)
const parsedConfig = dotenvParseVariables(env)

const config = {
  //BINANCE
  BINANCE_API_KEY: parsedConfig.BINANCE_API_KEY as string,
  BINANCE_API_SECRET: parsedConfig.BINANCE_API_SECRET as string,
  BN_ENABLED_PAIRS: parsedConfig.BN_ENABLED_PAIRS as string[],
  //COINBASE
  CB_API_KEY: parsedConfig.CB_API_KEY as string,
  CB_ENABLED_PAIRS: parsedConfig.CB_ENABLED_PAIRS as string[],
  //DYDX
  DYDX_ENABLED_PAIRS: parsedConfig.DYDX_ENABLED_PAIRS as string[],
  //DATABASE
  WRITE_TO_DB: parsedConfig.WRITE_TO_DB as boolean,
  MONGO_URL: parsedConfig.MONGO_URL as string,
  //TRADING
  LEVERAGE: parsedConfig.LEVERAGE as number,
  //Back testing
  START_INDEX: parsedConfig.START_INDEX as number,
  //NODE defaults
  NODE_ENV: parsedConfig.NODE_ENV as 'prod' | 'dev' | undefined,
  LOG_LEVEL: parsedConfig.LOG_LEVEL as string,

  //API
  API_SECRET: parsedConfig.API_SECRET as string,
  API_WHITELIST: parsedConfig.API_WHITELIST as string[],

  OKX_KEY: parsedConfig.OKX_KEY as string,
  OKX_SECRET: parsedConfig.OKX_SECRET as string,
  OKX_PASS: parsedConfig.OKX_PASS as string,

  EXCHANGE: '',
  SQL_PORT: null,
}

export default config
