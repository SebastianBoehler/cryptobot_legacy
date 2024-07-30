import loadCompanyData from './sec'
;(async () => {
  const tickers: any[] = [] //['AAPL', 'GOOGL', 'AMZN', 'MSFT']

  for (const ticker of tickers) {
    await loadCompanyData(ticker)
  }

  const resp = await fetch('http://localhost:3001/strategy/backtest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      strategy: `
      class TestStrategy {
        constructor() {
          this.name = 'test-strategy'
          this.startCapital = 250
          this.steps = 6
          this.multiplier = 0.95
          this.stopLoss = -80
          this.leverReduce = -60
        }
        async update(price, indicators, time) {
          if (!this.orderHelper) throw new Error('OrderHelper not initialized')
          console.log('price', price)
        }
      }
      `,
    }),
  })

  const data = await resp.json()
  console.log(data)

  console.log('done')

  process.exit(0)
})()
