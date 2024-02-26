import { RestClient } from 'okx-api'
import { LiveOrderHelper } from './orderHelper'
import { sleep } from './utils'
import fs from 'node:fs'
import config from './config/config'

const symbol = 'UNI-USDT-SWAP'
const orderHelper = new LiveOrderHelper(symbol)

const okxClient = new RestClient({
  apiKey: config.OKX_KEY,
  apiSecret: config.OKX_SECRET,
  apiPass: config.OKX_PASS,
})

async function main() {
  await orderHelper.getContractInfo()
  await orderHelper.setLeverage(2)
  await sleep(1000 * 10)
  await orderHelper.update(0, new Date())
  console.log('price', orderHelper.price)
  const balanceObj = await okxClient.getBalance()
  const balance = balanceObj[0].details.find((b) => b.ccy === 'USDT')!.availBal
  const buy = await orderHelper.openOrder('long', 10)
  const close = await orderHelper.closeOrder(buy!.size)

  await sleep(1000 * 10)

  const balanceObj2 = await okxClient.getBalance()
  const balance2 = balanceObj2[0].details.find((b) => b.ccy === 'USDT')!.availBal

  const data = {
    buy,
    close,
    profit: +balance2 - +balance,
    gains: orderHelper.profitUSD,
  }
  fs.writeFileSync('orderHelper.json', JSON.stringify(data, null, 2))
  process.exit(0)
}

main()
