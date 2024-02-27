import { LiveOrderHelper } from './orderHelper'
import { sleep } from './utils'

const symbol = 'UNI-USDT-SWAP'
const orderHelper = new LiveOrderHelper(symbol)

async function main() {
  await orderHelper.getContractInfo()
  await orderHelper.setLeverage(2, 'long')
  await sleep(1000 * 10)
  await orderHelper.update(0, new Date())
  console.log('price', orderHelper.price)

  await orderHelper.openOrder('long', 10)

  await sleep(1000 * 10)

  await orderHelper.setLeverage(6, 'long')

  process.exit(0)
}

main()
