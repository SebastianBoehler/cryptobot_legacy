import { RestClient } from 'okx-api'
import config from './config/config'

const okxClient = new RestClient({
  apiKey: config.OKX_KEY,
  apiSecret: config.OKX_SECRET,
  apiPass: config.OKX_PASS,
})

async function main() {
  const symbol = 'RNDR-USDT-SWAP'
  let candles = await okxClient.getHistoricCandles(symbol, '1m', {
    //after: lastCandleTime.getTime() + "",
    //: Date.now() + '',
  })

  const first = candles[0]
  const last = candles[candles.length - 1]

  const start = new Date(+first[0])
  const end = new Date(+last[0])

  console.log(start, end)
}

main()
