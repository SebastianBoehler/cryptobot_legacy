import { backtest } from './backtest'
import MongoWrapper from './mongodb'
import { logger } from './utils'
import { spawn } from 'child_process'

const mongo = new MongoWrapper('backtests')
const prodMongo = new MongoWrapper(
  'backtests',
  'mongodb+srv://doadmin:V694QMBq875Ftz31@dbaas-db-4719549-794fc217.mongo.ondigitalocean.com/admin?tls=true&authSource=admin&replicaSet=dbaas-db-4719549'
)
const startCapital = 300
const startDate = new Date('2024-04-01')
const exchange = 'okx'
const symbol = 'PYTH-USDT-SWAP' // Replace with your symbol

async function main() {
  try {
    logger.info('Starting backtest')

    // Start the Python agent as a child process
    const pythonProcess = spawn('python', ['/Users/sebastianboehler/Documents/GitHub/cryptobot3.0/src/agent.py'])

    // Handle communication
    let currentParameters: any[] = [0.5, 0.2, 0.8] // Initial parameters

    pythonProcess.stdout.on('data', (data) => {
      // Read new parameters from the Python agent
      logger.info('data', data.toString())
      let newParameters
      try {
        newParameters = JSON.parse(data.toString())
      } catch (error) {
        logger.error('Error parsing JSON:', data.toString())
        return
      }
      currentParameters = newParameters
      logger.info('New parameters:', newParameters)
    })

    pythonProcess.stderr.on('data', (data) => {
      logger.error('Error from Python agent:', data.toString())
    })

    pythonProcess.on('error', (error) => {
      logger.error('Python agent error:', error)
    })

    // ... (Run your backtest with the parameters provided by the Python agent)
    while (true) {
      const backtestResult = await backtest(symbol, exchange, startDate, undefined, startCapital, 'build_scalp_fast', {
        multiplier: currentParameters[0],
        //stopLoss: currentParameters[1],
        //steps: currentParameters[2],
      })
      logger.info(`Backtest result: ${backtestResult[0].pnl}`)

      pythonProcess.emit('message', JSON.stringify(backtestResult[0].pnl))

      // Send backtest result to the Python agent
      pythonProcess.stdin.write(JSON.stringify({ reward: +backtestResult[0].pnl.toFixed(2) }) + '\n', (err) => {
        if (err) {
          console.error('Error writing to Python process:', err)
        }
      })
      await new Promise((resolve) => setTimeout(resolve, 1000 * 10))
    }
  } catch (error) {
    logger.error('Error during backtests:', error)
  } finally {
    await mongo.close()
    await prodMongo.close()
    process.exit(0)
  }
}

main()
