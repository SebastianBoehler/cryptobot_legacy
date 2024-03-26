import extendedEnv from 'dotenv-extended'
import dotenvParseVariables from 'dotenv-parse-variables'
import { logger } from '../utils'

const envName = process.env.NODE_ENV?.split(' ').join('')
const options = {
  silent: false,
  defaults: './src/config/.env.defaults',
  schema: './src/config/.env.schema',
  path: `./src/config/.env.${envName}`,
  includeProcessEnv: true,
  assignToProcessEnv: true,
  overrideProcessEnv: false,
}

logger.debug('loading environment', envName)
const env = extendedEnv.load(options)
const parsedConfig = dotenvParseVariables(env)

const config = {
  //DYDX
  DYDX_ENABLED_PAIRS: parsedConfig.DYDX_ENABLED_PAIRS as string[],
  //DATABASE
  WRITE_TO_DB: parsedConfig.WRITE_TO_DB as boolean,
  MONGO_URL: parsedConfig.MONGO_URL as string,
  //NODE defaults
  NODE_ENV: parsedConfig.NODE_ENV as 'prod' | 'dev' | 'hb' | undefined,
  LOG_LEVEL: parsedConfig.LOG_LEVEL as string,

  //API
  API_SECRET: parsedConfig.API_SECRET as string,
  API_WHITELIST: parsedConfig.API_WHITELIST as string[],

  //OKX
  OKX_KEY: parsedConfig.OKX_KEY as string,
  OKX_SECRET: parsedConfig.OKX_SECRET as string,
  OKX_PASS: parsedConfig.OKX_PASS as string,
  OKX_ENABLED_PAIRS: parsedConfig.OKX_ENABLED_PAIRS as string[],

  //BYBIT
  BYBIT_KEY: parsedConfig.BYBIT_KEY as string,
  BYBIT_SECRET: parsedConfig.BYBIT_SECRET as string,

  //TRADING
  STRATEGY: parsedConfig.STRATEGY as 'BUILD_SCALP' | 'BUILD_SCALP_FAST' | 'SCALP_INDICATORS' | 'FAST_V2' | undefined,
  START_CAPITAL: parsedConfig.START_CAPITAL as number | undefined,
  SYMBOL: parsedConfig.SYMBOL as string | undefined,
  MULTIPLIER: parsedConfig.MULTIPLIER as number | undefined,
}

export default config
