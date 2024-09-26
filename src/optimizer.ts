import { backtest } from './backtest'
import MongoWrapper from './mongodb'
import { logger } from './utils'
import { spawn } from 'child_process'
import AsciiChart from 'asciichart' // Import asciichart

const mongo = new MongoWrapper('backtests')
const prodMongo = new MongoWrapper(
  'backtests',
  'mongodb+srv://doadmin:V694QMBq875Ftz31@dbaas-db-4719549-794fc217.mongo.ondigitalocean.com/admin?tls=true&authSource=admin&replicaSet=dbaas-db-4719549'
)
const startCapital = 720
const startDate = new Date('2024-04-01')
const exchange = 'okx'
const symbol = 'AR-USDT-SWAP' // Replace with your symbol

async function main() {
  try {
    logger.info('Starting backtest')

    // Start the Python agent as a child process
    const pythonProcess = spawn('python', ['/Users/sebastianboehler/Documents/GitHub/cryptobot3.0/src/agent.py'])

    // Handle communication
    let currentParameters: any[] = [6, 0.05, -30, -15] // Initial parameters
    let losses: number[] = []
    //let dataBuffer = ''
    let previousParameters: any[] = [] // Track previous parameters

    pythonProcess.stdout.on('data', (data) => {
      // Read new parameters or loss value from the Python agent
      //dataBuffer += data.toString()
      const string = data.toString()
      const lines = string.split('\n')

      logger.info(lines)

      lines.forEach((line: string) => {
        const trimmedLine = line.trim()

        if (trimmedLine.startsWith('{')) {
          // Parse JSON for new parameters
          try {
            const { parameters: newParameters } = JSON.parse(trimmedLine)
            // Only log if the parameters have changed
            if (JSON.stringify(newParameters) !== JSON.stringify(previousParameters)) {
              currentParameters = newParameters
              logger.info(
                'New parameters:',
                {
                  steps: newParameters[0],
                  multiplier: newParameters[1],
                  stopLoss: newParameters[2],
                  leverReduce: newParameters[3],
                },
                typeof newParameters
              ) // Log only when new parameters are received
              previousParameters = newParameters // Update previous parameters
            }
          } catch (error) {
            logger.error('Error parsing JSON:', trimmedLine)
          }
        } else if (trimmedLine.startsWith('Loss:')) {
          // Parse loss value
          const lossValue = parseFloat(trimmedLine.split('Loss: ')[1]) // Extract the loss value
          losses.push(lossValue)
          //logger.info('Loss x:', lossValue, typeof lossValue, losses.length)
        }
      })
    })

    pythonProcess.stderr.on('data', (data) => {
      logger.error('Stderr from Python agent:', data.toString())
    })

    pythonProcess.on('error', (error) => {
      logger.error('Python agent error:', error)
    })

    // ... (Run your backtest with the parameters provided by the Python agent)
    while (true) {
      // Don't send the received parameters back to the agent
      // Instead, use the currentParameters (which are updated when the agent sends new parameters)
      //logger.info('Iteration start', currentParameters)
      const backtestResult = await backtest(symbol, exchange, startDate, undefined, startCapital, 'build_scalp_fast', {
        steps: currentParameters[0],
        multiplier: currentParameters[1],
        stopLoss: currentParameters[2],
        leverReduce: currentParameters[3],
      })

      // Handle the case where backtestResult is undefined (no trades)
      let reward = 0
      if (backtestResult.length > 0) {
        // Calculate reward based on .pnl and .winRatio
        reward = backtestResult[0].pnl * 0.6 + backtestResult[0].winRatio * 0.4
        logger.info(`Backtest result: ${backtestResult[0].pnl}, winRatio: ${backtestResult[0].winRatio}`)
        logger.info(`Reward: ${reward}`)
      } else {
        logger.info('No trades triggered during backtest.')
      }

      plotLoss(losses) // Plot the loss using ASCII chart

      // Send backtest result and parameters to the Python agent
      pythonProcess.stdin.write(
        JSON.stringify({
          reward: reward,
          parameters: currentParameters,
        }) + '\n',
        (err) => {
          if (err) {
            console.error('Error writing to Python process:', err)
          }
        }
      )
      // Reduce timeout to 5 seconds
      await new Promise((resolve) => setTimeout(resolve, 1000 * 5)) // 5 seconds
    }
  } catch (error) {
    logger.error('Error during backtests:', error)
  } finally {
    await mongo.close()
    await prodMongo.close()
    process.exit(0)
  }
}

function plotLoss(losses: number[]) {
  logger.info('loss length', losses.length)
  const everyNth = losses.filter((_, idx) => idx % 2 == 0)
  if (everyNth.length < 2) return
  // Use asciichart to plot the loss
  // @ts-ignore
  console.log(AsciiChart.plot(everyNth, { height: 9, colors: [AsciiChart.green] }))
}

main()
