import config from './config/config'
import { sleep } from './utils'
import { BybitClient } from './bybit/utils'

const symbol = 'MNTUSDT'
const client = new BybitClient(config.BYBIT_KEY, config.BYBIT_SECRET)
async function main() {
  client.subscribeToTicker(symbol)
  await client.setLeverage(symbol, 3)
  await sleep(1000 * 5)

  const response = await client.placeMarketOrder(symbol, 'Buy', 2)

  await sleep(1000 * 2)

  const details = await client.getOrderDetails(response.orderId)

  console.log(details)

  await sleep(1000 * 5)

  await client.setLeverage(symbol, 10)

  while (client.position) {
    await sleep(1000 * 5)
    console.log(client.position)
  }
}
main()
