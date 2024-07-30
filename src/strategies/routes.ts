import express, { Request, Response } from 'express'
import { backtest } from '../backtest'
import { Base } from './base'
import { Strategy } from 'cryptobot-types'

const router = express.Router()

router.post('/backtest', async (req: Request, res: Response) => {
  const { strategy } = req.body

  try {
    if (!strategy) {
      res.status(400).send('strategy query parameter is required')
      return
    }

    // Parse the strategy string
    const StrategyClass = eval(`(${strategy})`)
    const strategyObject = new StrategyClass() // Create a temporary instance

    // Extend the StrategyClass with Base
    class ExtendedStrategy extends Base implements Strategy {
      public readonly name = 'placeholder'
      public startCapital = 250

      update = strategyObject.update

      constructor() {
        super()
        // Initialize any properties from the parsed strategy
        Object.assign(this, strategyObject) // Copy all properties
      }
    }

    const strategyInstance = new ExtendedStrategy()

    if (!strategyInstance || strategyInstance.name === 'placeholder') {
      res.status(400).send('Invalid strategy')
      return
    }

    // Now you can use the strategyInstance
    const result = await backtest(
      'SOL-USDT-SWAP',
      'okx',
      new Date('2024-05-10'),
      'test',
      2500,
      undefined,
      { name: 'strategy_naming_here' },
      strategyInstance
    ).catch((error) => {
      console.error('Error in backtest:', error)
      throw error
    })

    res.json({ result })
  } catch (error) {
    res.status(500).send({
      message: 'Error',
      error,
    })
  }
})

export default router
