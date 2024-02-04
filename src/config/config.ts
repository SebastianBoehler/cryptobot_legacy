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
  NODE_ENV: parsedConfig.NODE_ENV as 'prod' | 'dev' | undefined,
  LOG_LEVEL: parsedConfig.LOG_LEVEL as string,

  //API
  API_SECRET: parsedConfig.API_SECRET as string,
  API_WHITELIST: parsedConfig.API_WHITELIST as string[],

  OKX_KEY: parsedConfig.OKX_KEY as string,
  OKX_SECRET: parsedConfig.OKX_SECRET as string,
  OKX_PASS: parsedConfig.OKX_PASS as string,
}

export default config
