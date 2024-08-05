import { BacktestingResult, Indicators, Strategy } from 'cryptobot-types'
import { GenerateIndicators } from './indicators'
import MongoWrapper from './mongodb'
import strategies from './strategies'
import { calculateSharpeRatio, createUniqueId, logger } from './utils'
import { Base } from './strategies/base'

const mongo = new MongoWrapper('backtests')
const prodMongo = new MongoWrapper(
  'backtests',
  'mongodb+srv://doadmin:V694QMBq875Ftz31@dbaas-db-4719549-794fc217.mongo.ondigitalocean.com/admin?tls=true&authSource=admin&replicaSet=dbaas-db-4719549'
)

const saveToMongo = true

interface StrategyParams {
  steps?: number
  multiplier?: number
  stopLoss?: number
  [key: string]: any
}

type ParsedStrategy<T extends Base & Strategy> = T

export async function backtest(
  symbol: string,
  exchange = 'okx',
  start?: Date, // = new Date('2024-01-10'),
  identifier?: string,
  amount?: number,
  strategyName?: keyof typeof strategies,
  params: StrategyParams = {},
  strategy?: ParsedStrategy<any>
) {
  const history = await mongo.getHistory<{ close: string; start: Date; high: string; low: string }>(exchange, symbol, {
    close: 1,
    high: 1,
    low: 1,
  })
  const indicators: GenerateIndicators[] = [
    new GenerateIndicators(exchange, symbol, 5),
    //new GenerateIndicators(exchange, symbol, 60),
    new GenerateIndicators(exchange, symbol, 60 * 12),
  ]

  //returns & deletes first 5k candles
  history.splice(0, 10_000)

  const rndStr = createUniqueId(4)

  const strategyArray = strategy ? [strategy] : strategyName ? [strategies[strategyName]] : Object.values(strategies)
  //console.log(strategy, strategyArray)
  for (const strategy of strategyArray) {
    //for every parameter in params, set the value in the strategy
    for (const [key, value] of Object.entries(params)) {
      //@ts-ignore
      if (strategy[key]) strategy[key] = value
    }

    logger.debug('initalizing', strategy.name)
    await strategy.initalize(symbol, exchange, saveToMongo, false)
    if (strategy.orderHelper) strategy.orderHelper.identifier = identifier || `${strategy.name}-${symbol}-${rndStr}`
    if (amount) strategy.startCapital = amount
  }

  outer: for (const candle of history) {
    const price = +candle.close
    const date = candle.start
    if (start && date < start) continue
    const indicatorsPromise = await Promise.all(indicators.map((i) => i.getIndicators(date)))
    const indicatorsLoaded = indicatorsPromise.filter((i) => i !== undefined) as unknown as Indicators[]

    for (const strategy of strategyArray) {
      await strategy.update(price, indicatorsLoaded, date)
      //await strategy.update(high, indicatorsLoaded, date)
      //await strategy.update(low, indicatorsLoaded, date)
      //if (strategy.orderHelper?.position && strategy.orderHelper.position.orders.length >= 4) break outer
    }
  }

  const results: BacktestingResult[] = []
  for (const strategy of strategyArray) {
    if (!strategy.orderHelper) throw new Error('no orderHelper')
    const identifier = strategy.orderHelper.identifier
    const margin = strategy.orderHelper.position?.margin || 0
    if (!identifier) throw new Error('no identifier')
    await strategy.end()

    const positions = await mongo.loadAllPositions(identifier)
    if (!positions.length) continue
    await prodMongo.writeMany('positions', positions)

    const winRatio = positions.filter((pos) => pos.realizedPnlUSD > 0).length / positions.length
    const pnl = strategy.orderHelper.profitUSD || 0
    const pnl_pct = (pnl / strategy.startCapital) * 100

    const stringifiedFunc = strategy.update.toString()
    const orders = positions.map((pos) => pos.orders).flat()
    const liquidations = orders.filter((o) => o.ordId.slice(0, 4) === 'loss').length

    const firstCandle = history.find((c) => c.start >= (start || new Date(0))) || history[0]
    const hodl_pct = ((+history[history.length - 1].close - +firstCandle.close) / +firstCandle.close) * 100

    //TODO: Maximum Drawdown: The largest percentage drop from peak to trough in your portfolio's value.

    const diff = pnl_pct - hodl_pct
    const hodl_ratio = diff / hodl_pct

    // --- Risk Metric Calculation Start ---

    let runningProfitUSD = 0
    let peakProfitUSD = 0
    let maxDrawdown = 0
    const returns: number[] = []

    for (const pos of positions) {
      runningProfitUSD += pos.realizedPnlUSD
      returns.push(pos.realizedPnlUSD) // Calculate return for this order

      peakProfitUSD = Math.max(peakProfitUSD, runningProfitUSD)
      maxDrawdown = Math.max(maxDrawdown, (peakProfitUSD - runningProfitUSD) / strategy.startCapital)

      // ... (Calculate other risk metrics using the 'returns' array)
    }

    const baseReturn = strategy.startCapital * (hodl_pct / 100)
    const sharpeRatio = calculateSharpeRatio(returns, baseReturn) // Use hodl_pct as base return

    // --- Risk Metric Calculation End ---

    results.push({
      trades: positions.length,
      identifier,
      name: strategy.name,
      startCapital: strategy.startCapital,
      symbol,
      margin,
      //TODO: remove orders from results
      //orders,
      pnl,
      winRatio,
      stringifiedFunc,
      time: new Date(),
      start: start || history[0].start,
      end: history[history.length - 1].start,
      pnl_pct,
      hodl_pct,
      liquidations,
      exchange,
      hodl_ratio: hodl_pct < 0 || pnl_pct < 0 ? (pnl_pct / hodl_pct) * -1 : pnl_pct / hodl_pct,
      maxDrawdown,
      // @ts-ignore
      sharpeRatio,
    })

    logger.info('compare ratio calc', { diff, hodl_ratio })
  }

  await prodMongo.writeMany('results', results)

  return results
}
