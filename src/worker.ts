import { createHash } from 'crypto'
import { BybitClient } from './bybit/utils'
import config from './config/config'
import { OkxClient } from './okx/utils'
import MongoWrapper from './mongodb'
import { logger } from './utils'
import loadCompanyData from './sec'

const accounts = [
  { exchange: 'bybit', apiKey: config.BYBIT_KEY, apiSecret: config.BYBIT_SECRET },
  { exchange: 'okx', apiKey: config.OKX_KEY, apiSecret: config.OKX_SECRET, apiPass: config.OKX_PASS },
]

const mongo = new MongoWrapper('trader')

// ** JOB 1: Account Balances **
async function accountBalances() {
  const array = []
  const time = new Date()
  for (const account of accounts) {
    try {
      if (account.exchange === 'bybit') {
        const bybit = new BybitClient(account.apiKey, account.apiSecret)
        const value = await bybit.getAccountBalance()
        if (!value || value === '') {
          logger.error('Error getting account balance on bybit')
          continue
        }
        array.push({
          accHash: createHash('sha256').update(account.apiKey).digest('hex'),
          value,
          time,
        })
      } else if (account.exchange === 'okx') {
        const okx = new OkxClient({
          apiKey: account.apiKey,
          apiSecret: account.apiSecret,
          apiPass: account.apiPass!,
        })
        const value = await okx.getAccountBalance()
        if (!value) {
          logger.error('Error getting account balance on okx')
          continue
        }
        array.push({
          accHash: createHash('sha256').update(account.apiKey).digest('hex'),
          value,
          time,
        })
      }
    } catch (error) {
      logger.error('Error getting account balance', error)
    }
  }

  logger.info(`Writing ${array.length} account balances to database`)
  await mongo.writeMany('accountBalances', array)
}

// ** JOB 2: Load SEC Filings **
async function loadSecFilings() {
  const tickers = ['AAPL', 'GOOGL', 'AMZN', 'MSFT', 'TSLA', 'NVDA', 'PYPL', 'ADBE']
  const promises = []
  for (const ticker of tickers) {
    promises.push(loadCompanyData(ticker))
  }

  await Promise.allSettled(promises)
}

async function main() {
  const startTime = new Date()
  const result = await Promise.allSettled([accountBalances(), loadSecFilings()])
  const errors = result.filter((r) => r.status === 'rejected')
  if (errors.length > 0) {
    logger.error('Errors occurred during processing')
    for (const error of errors) {
      logger.error(error.reason)
    }
  }

  const endTime = new Date()
  logger.info(`Finished in ${endTime.getTime() - startTime.getTime() / 1000}s`)

  await mongo.close()
  process.exit(0)
}

main()
