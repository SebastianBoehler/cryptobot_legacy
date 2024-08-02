import { spawn } from 'child_process'
import { backtest } from './backtest'
import MongoWrapper from './mongodb'
import { logger } from './utils'
import { writeFileSync } from 'fs'
import AsciiChart from 'asciichart' // Import asciichart
import { differenceInSeconds } from 'date-fns'

const mongo = new MongoWrapper('backtests')
const prodMongo = new MongoWrapper(
  'backtests',
  'mongodb+srv://doadmin:V694QMBq875Ftz31@dbaas-db-4719549-794fc217.mongo.ondigitalocean.com/admin?tls=true&authSource=admin&replicaSet=dbaas-db-4719549'
)
const startCapital = 500
const startDate = new Date('2024-04-01')
const exchange = 'okx'
const file = 'old_agent.py'

async function runPythonScript(scriptPath: string, args: string[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', [scriptPath, ...args])
    let finalOutput: String

    python.stdout.on('data', (data: any) => {
      const outputLines = data.toString().split('\n')

      outputLines.forEach((line: string) => {
        try {
          finalOutput = JSON.parse(line)
        } catch (error) {
          //logger.info(`Python debug: ${line}`)
        }
      })
    })

    python.stderr.on('data', (data: any) => {
      //logger.error(`Python script error: ${data}`)
    })

    python.on('close', (code: any) => {
      if (code !== 0) {
        reject(`Python script exited with code ${code}`)
      } else {
        if (finalOutput) {
          resolve(finalOutput)
        } else {
          reject('No valid JSON output received from Python script.')
        }
      }
    })
  })
}

async function runBacktestWithOptimization(symbol: string, maxIterations: number = 80) {
  let bestResult = null
  let noResultCount = 0
  let lossValues: number[] = [] // Array to store loss values

  for (let i = 0; i < maxIterations; i++) {
    logger.info(`Starting optimization iteration ${i + 1} for ${symbol}`)
    const start = new Date()

    try {
      // 1. Get initial parameters from the RL agent
      const initialOutput = await runPythonScript(`/Users/sebastianboehler/Documents/GitHub/cryptobot3.0/src/${file}`)
      const initialData = initialOutput

      const parameters = {
        steps: initialData.steps,
        stopLoss: initialData.stopLoss,
        leverReduce: initialData.leverReduce,
        multiplier: initialData.multiplier,
        takeProfitRate: initialData.takeProfitRate,
        takeProfitThreshold: initialData.takeProfitThreshold,
        buyLowRate: initialData.buyLowRate,
      }

      // 2. Run backtest with the initial parameters
      const result = await backtest(symbol, exchange, startDate, undefined, startCapital, 'alts', {
        ...parameters,
        //name: `full_${initialData.steps}_${initialData.takeProfitRate}_${initialData.stopLoss}_${initialData.leverReduce}_${initialData.takeProfitThreshold}_${initialData.buyLowRate}`,
        name: `opt_${Object.values(parameters).join('_')}`,
      })

      let reward: number
      if (!result || result.length === 0) {
        noResultCount++
        logger.warn(`No backtest result found for ${symbol}`)
        if (noResultCount > 10) break
        continue
      }

      result[0].pnl = parseFloat(result[0].pnl.toFixed(2))

      // 3. Calculate reward
      reward =
        result[0].pnl * 0.5 +
        result[0].winRatio * 0.3 +
        result[0].liquidations * -1 * 0.1 +
        result[0].maxDrawdown * -1 * 0.1

      // 5. Send reward and parameters back to the agent for learning
      const agentOutput = await runPythonScript(`/Users/sebastianboehler/Documents/GitHub/cryptobot3.0/src/${file}`, [
        JSON.stringify({ reward, ...parameters /*, ... other data you need to send */ }),
      ])

      logger.info(`Agent: ${JSON.stringify(agentOutput)}`)

      const latestLossValue = agentOutput.loss

      if (latestLossValue) {
        lossValues.push(latestLossValue)
        // Apply logarithmic transformation to the loss values (using natural log)
        const transformedLossValues = lossValues.map((loss) => loss)

        // Plot the loss values after each new loss is added
        //console.clear()
        console.log('\nLoss Progress:')
        if (lossValues.length > 32)
          // @ts-ignore
          console.log(AsciiChart.plot(transformedLossValues, { height: 9, colors: [AsciiChart.green] }))
        logger.info(`Iteration ${i + 1} for ${symbol}, Loss: ${latestLossValue}, Profit: ${result[0].pnl}`)
      }

      // 6. Keep track of the best result
      if (!bestResult || result[0].pnl > bestResult.rest.pnl) {
        const { orders, stringifiedFunc, ...rest } = result[0]

        if (bestResult) {
          // Delete old best result
          await Promise.all([
            prodMongo.delete({ identifier: bestResult.identifier }, 'results', 'backtests'),
            prodMongo.delete({ identifier: bestResult.identifier }, 'positions', 'backtests'),
          ])
        }

        logger.debug('New best result found:', rest.pnl)
        bestResult = { reward, parameters, rest, identifier: result[0].identifier }
      } else {
        await Promise.all([
          prodMongo.delete({ identifier: result[0].identifier }, 'results', 'backtests'),
          prodMongo.delete({ identifier: result[0].identifier }, 'positions', 'backtests'),
        ])
      }

      await mongo.delete({ identifier: result[0].identifier }, 'positions', 'backtests')
    } catch (error) {
      logger.error(`Error in iteration ${i + 1} for ${symbol}:`, error)
    }

    logger.info('Final duration', differenceInSeconds(new Date(), start))

    await new Promise((resolve) => setTimeout(resolve, 1000 * 2))
  }

  // Plot the loss values using asciichart
  if (lossValues.length > 0) {
    console.log('\nLoss Progress:')
    console.log(
      // @ts-ignore
      AsciiChart.plot(lossValues, {
        height: 9, // Set height to 8 lines
        // @ts-ignore
        colors: [AsciiChart.green], // Use green color for the line
        padding: '       ', // Add padding to the left of the chart
      })
    )
  }

  return bestResult
}

async function main() {
  try {
    const symbols = [{ symbol: 'JUP-USDT-SWAP' }] //await mongo.symbolsSortedByVolume(exchange)
    const results = []
    const runName = `run_${new Date().toLocaleTimeString()}`
    const filtered = symbols.filter((s: any) => s.symbol.includes('USDT'))

    for (const { symbol } of filtered) {
      const pairs = symbol.split('-')
      if (pairs[1] === 'USD') continue

      logger.info('Starting optimized backtest for', symbol)
      const bestResult = await runBacktestWithOptimization(symbol)

      if (bestResult) {
        logger.info(`Best result for ${symbol}:`, bestResult.rest.pnl)
        results.push(bestResult)
      } else {
        logger.warn(`No valid result found for ${symbol}`)
      }
    }

    writeFileSync(`results_${runName}.json`, JSON.stringify(results, null, 2))
  } catch (error) {
    logger.error('Error during backtests:', error)
  } finally {
    await mongo.close()
    await prodMongo.close()
    process.exit(0)
  }
}

main()
