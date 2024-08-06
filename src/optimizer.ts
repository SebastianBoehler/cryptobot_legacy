//import { spawn } from 'child_process'
import { backtest } from './backtest'
import MongoWrapper from './mongodb'
import { logger } from './utils'
// import { writeFileSync } from 'fs'
// import AsciiChart from 'asciichart' // Import asciichart
import { differenceInSeconds } from 'date-fns'

const mongo = new MongoWrapper('backtests')
const prodMongo = new MongoWrapper(
  'backtests',
  'mongodb+srv://doadmin:V694QMBq875Ftz31@dbaas-db-4719549-794fc217.mongo.ondigitalocean.com/admin?tls=true&authSource=admin&replicaSet=dbaas-db-4719549'
)
const startCapital = 300
const startDate = new Date('2024-04-01')
const exchange = 'okx'
const symbol = 'PYTH-USDT-SWAP' // Replace with your symbol

const parameters = {
  steps: 5, // Replace with your desired parameters
  stopLoss: -25,
  leverReduce: -26,
  multiplier: 1.05,
  name: `opt_5_-25_-26_1.05_0.01_0.02_0.03`, // Replace with your desired name
}

async function main() {
  try {
    logger.info('Starting backtest')
    const start = new Date()
    const backtestResult = await backtest(symbol, exchange, startDate, undefined, startCapital, 'build_scalp_fast', {
      ...parameters,
    })
    logger.info(`Backtest result: ${JSON.stringify(backtestResult)}`)
    logger.info('Final duration', differenceInSeconds(new Date(), start))
  } catch (error) {
    logger.error('Error during backtests:', error)
  } finally {
    await mongo.close()
    await prodMongo.close()
    process.exit(0)
  }
}

main()
