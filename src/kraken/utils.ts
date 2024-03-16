import { getUnixTime } from 'date-fns'
import { OHLCResponse, TradablePairsResponse } from './types'

class Kraken {
  constructor() {}

  async getTradablePairs() {
    const url = 'https://api.kraken.com/0/public/AssetPairs'
    const response = await fetch(url)
    const json: TradablePairsResponse = await response.json()
    return json.result
  }

  async getOHLCdata(symbol: string, interval: number = 1, since: Date) {
    const url = `https://api.kraken.com/0/public/OHLC?pair=${symbol}&interval=${interval}&since=${getUnixTime(since)}`
    const response = await fetch(url)
    const json: OHLCResponse = await response.json()

    //remove last element
    json.result[symbol].sort((a, b) => a[0] - b[0])
    json.result[symbol].pop()
    return json.result[symbol]
  }
}

export default Kraken
