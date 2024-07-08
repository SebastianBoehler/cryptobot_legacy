import { spawn } from 'child_process'
import { backtest } from './backtest'
import MongoWrapper from './mongodb'
import { logger } from './utils'
import { writeFileSync } from 'fs'

const mongo = new MongoWrapper('backtests')
const prodMongo = new MongoWrapper(
  'backtests',
  'mongodb+srv://doadmin:V694QMBq875Ftz31@dbaas-db-4719549-794fc217.mongo.ondigitalocean.com/admin?tls=true&authSource=admin&replicaSet=dbaas-db-4719549'
)
const startCapital = 1500
const startDate = new Date('2024-01-01')
const exchange = 'okx'

async function runPythonScript(scriptPath: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', [scriptPath, ...args])

    let output = ''
    python.stdout.on('data', (data: any) => {
      //logger.info(`Python script output: ${data}`)
      output += data.toString()
    })

    python.stderr.on('data', (data: any) => {
      //logger.error(`Python script error: ${data}`)
    })

    python.on('close', (code: any) => {
      if (code !== 0) {
        reject(`Python script exited with code ${code}`)
      } else {
        resolve(output)
      }
    })
  })
}

async function runBacktestWithOptimization(symbol: string, maxIterations: number = 70) {
  let bestResult = null

  let noResultCount = 0
  for (let i = 0; i < maxIterations; i++) {
    logger.info(`Starting optimization iteration ${i + 1} for ${symbol}`)

    try {
      // 1. Get parameters from the RL agent
      const output = await runPythonScript('/Users/sebastianboehler/Documents/GitHub/cryptobot3.0/src/old_agent.py')
      const parameters = JSON.parse(output)
      const { steps, stopLoss, leverReduce, multiplier } = parameters

      // 2. Run backtest with the received parameters
      const result = await backtest(symbol, exchange, startDate, undefined, startCapital, 'build_scalp_fast', {
        ...parameters,
        name: `optimized_${steps}_${multiplier}_${stopLoss}_${leverReduce}`,
      })

      if (!result || result.length === 0) {
        noResultCount++
        logger.warn(`No backtest result found for ${symbol}`)
        if (noResultCount > 10) break
        continue
      }

      // Trim decimals on result[0].pnl BEFORE calculating reward
      result[0].pnl = parseFloat(result[0].pnl.toFixed(2)) // Adjust decimal places as needed

      // 3. Calculate reward (you may want to adjust this based on your preferences)
      const reward =
        result[0].pnl * 0.5 +
        result[0].winRatio * 0.3 +
        result[0].liquidations * -1 * 0.1 +
        result[0].maxDrawdown * -1 * 0.1

      console.log(parameters)
      // 4. Send the result back to the RL agent for learning
      await runPythonScript('/Users/sebastianboehler/Documents/GitHub/cryptobot3.0/src/old_agent.py', [
        JSON.stringify({ reward, ...parameters }),
      ])

      // 5. Keep track of the best result
      if (!bestResult || reward > bestResult.reward) {
        const { orders, stringifiedFunc, ...rest } = result[0]

        //delete previous best result
        if (bestResult)
          await Promise.all([
            prodMongo.delete({ identifier: bestResult.identifier }, 'positions', 'backtests'),
            prodMongo.delete({ identifier: bestResult.identifier }, 'results', 'backtests'),
          ])

        bestResult = { reward, parameters, rest, identifier: result[0].identifier }
      } else {
        await Promise.all([
          prodMongo.delete({ identifier: result[0].identifier }, 'positions', 'backtests'),
          prodMongo.delete({ identifier: result[0].identifier }, 'results', 'backtests'),
        ])
      }

      //always delete from local db
      mongo.delete({ identifier: result[0].identifier }, 'positions', 'backtests'),
        logger.info(`Iteration ${i + 1} for ${symbol} completed. Reward: ${reward}. Profit: ${result[0].pnl}`)
    } catch (error) {
      logger.error(`Error in iteration ${i + 1} for ${symbol}:`, error)
    }
  }

  return bestResult
}

async function main() {
  try {
    const symbols = await mongo.symbolsSortedByVolume(exchange)

    const results = []
    const runName = `run_${new Date().toLocaleTimeString()}`

    const filtered = symbols.filter((s: any) => s.symbol.includes('USDT'))
    for (const { symbol } of filtered) {
      const pairs = symbol.split('-')
      if (pairs[1] === 'USD') continue

      logger.info('Starting optimized backtest for', symbol)
      const bestResult = await runBacktestWithOptimization(symbol)

      if (bestResult) {
        logger.info(`Best result for ${symbol}:`, bestResult)
        results.push(bestResult)
        // Here you might want to save the best result to your database
        //await mongo.saveOptimizedResult(symbol, bestResult)
      } else {
        logger.warn(`No valid result found for ${symbol}`)
      }

      writeFileSync(`results_${runName}.json`, JSON.stringify(results, null, 2))
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
