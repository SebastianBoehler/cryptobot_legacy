import { createHash } from 'crypto'
import { BybitClient } from './bybit/utils'
import config from './config/config'
import { OkxClient } from './okx/utils'
import MongoWrapper from './mongodb'
import { logger } from './utils'

const accounts = [
  { exchange: 'bybit', apiKey: config.BYBIT_KEY, apiSecret: config.BYBIT_SECRET },
  { exchange: 'okx', apiKey: config.OKX_KEY, apiSecret: config.OKX_SECRET, apiPass: config.OKX_PASS },
]

const mongo = new MongoWrapper('trader')

async function main() {
  const array = []
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
          time: new Date(),
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
          time: new Date(),
        })
      }
    } catch (error) {
      logger.error('Error getting account balance', error)
    }
  }

  logger.info(`Writing ${array.length} account balances to database`)
  await mongo.writeMany('accountBalances', array)
  await mongo.close()

  process.exit(0)
}

main()
