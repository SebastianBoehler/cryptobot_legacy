import { Indicators } from 'cryptobot-types'
import { GenerateIndicators } from './indicators'
import MongoWrapper from './mongodb'
import strategies from './strategies'
import { createUniqueId, logger } from './utils'

const mongo = new MongoWrapper('backtests')
const saveToMongo = true

export async function backtest(
  symbol: string,
  start?: Date,
  identifier?: string,
  amount?: number,
  strategyName?: keyof typeof strategies,
  steps?: number,
  multiplier?: number
) {
  const history = await mongo.getHistory<{ close: string; start: Date }>('okx', symbol, { close: 1 })
  const indicators = [new GenerateIndicators('okx', symbol, 15), new GenerateIndicators('okx', symbol, 60)]

  //returns & deletes first 5k candles
  //history.splice(0, 10_000)

  const rndStr = createUniqueId(4)

  const strategyArray = strategyName ? [strategies[strategyName]] : Object.values(strategies)
  for (const strategy of strategyArray) {
    logger.debug('initalizing', strategy.name)
    await strategy.initalize(symbol, saveToMongo, false)
    if (strategy.orderHelper) strategy.orderHelper.identifier = identifier || `${strategy.name}-${symbol}-${rndStr}`
    if (amount) strategy.startCapital = amount
    if (steps) strategy.steps = steps
    //@ts-ignore
    if (multiplier && strategy.multiplier) strategy.multiplier = multiplier
  }

  outer: for (const candle of history) {
    const price = +candle.close
    const date = candle.start
    if (start && date < start) continue
    const indicatorsPromise = await Promise.all(indicators.map((i) => i.getIndicators(date)))
    const indicatorsLoaded = indicatorsPromise.filter((i) => i !== undefined) as unknown as Indicators[]

    for (const strategy of strategyArray) {
      await strategy.update(price, indicatorsLoaded, date)
      //if (strategy.orderHelper?.position && strategy.orderHelper.position.orders.length >= 4) break outer
    }
  }

  const results = []
  for (const strategy of strategyArray) {
    if (!strategy.orderHelper) throw new Error('no orderHelper')
    const identifier = strategy.orderHelper.identifier
    const margin = strategy.orderHelper.position?.margin || 0
    if (!identifier) throw new Error('no identifier')
    await strategy.end()

    const positions = await mongo.loadAllPositions(identifier)
    if (!positions.length) {
      results.push({
        identifier,
        name: strategy.name,
        pnl: 0,
        winRatio: 0,
      })
      continue
    }

    const winRatio = positions.filter((pos) => pos.realizedPnlUSD > 0).length / positions.length
    const pnl = strategy.orderHelper.profitUSD || 0
    const pnl_pct = (pnl / strategy.startCapital) * 100

    const stringifiedFunc = strategy.update.toString()
    const orders = positions.map((pos) => pos.orders).flat()
    const liquidations = orders.filter((o) => o.ordId.slice(0, 3) === 'liq').length

    const hodl_pct = ((+history[history.length - 1].close - +history[0].close) / +history[0].close) * 100

    results.push({
      trades: positions.length,
      identifier,
      name: strategy.name,
      startCapital: strategy.startCapital,
      symbol,
      //temp
      margin,
      orders,

      pnl,
      winRatio,
      stringifiedFunc,
      time: new Date(),
      start: history[0].start,
      end: history[history.length - 1].start,
      pnl_pct,
      hodl_pct,
      liquidations,
    })
  }

  await mongo.writeBacktestResults('results', results)
}
