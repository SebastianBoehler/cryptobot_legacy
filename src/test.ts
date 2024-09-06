import config from './config/config'
import { OkxClient } from './okx/utils'
import loadCompanyData from './sec'
;(async () => {
  const tickers: any[] = [] //['AAPL', 'GOOGL', 'AMZN', 'MSFT']

  const okxClient = new OkxClient({
    apiKey: config.OKX_KEY,
    apiSecret: config.OKX_SECRET,
    apiPass: config.OKX_PASS,
  })

  const positions = await okxClient.getPositions()
  console.log(
    JSON.stringify(
      positions.filter((p) => p.instId === 'JUP-USDT-SWAP'),
      null,
      2
    )
  )

  const marginInfo = await okxClient.getAdjustLeverageInfo('SWAP', 'isolated', '20', 'long', 'JUP-USDT-SWAP')

  console.log(JSON.stringify(marginInfo, null, 2))

  for (const ticker of tickers) {
    await loadCompanyData(ticker)
  }

  //TODO: needs historic data on prod server
  // const resp = await fetch('http://localhost:3001/strategy/backtest', {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify({
  //     strategy: `
  //     class TestStrategy {
  //       constructor() {
  //         this.name = 'test-strategy'
  //         this.startCapital = 250
  //         this.steps = 6
  //         this.multiplier = 0.95
  //         this.stopLoss = -80
  //         this.leverReduce = -60
  //       }
  //       async update(price, indicators, time) {
  //         if (!this.orderHelper) throw new Error('OrderHelper not initialized')
  //         console.log('price', price)
  //       }
  //     }
  //     `,
  //   }),
  // })

  // const data = await resp.json()
  // console.log(data)

  await console.log('done')

  process.exit(0)
})()
