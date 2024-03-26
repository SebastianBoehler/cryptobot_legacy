import config from './config/config'
import { sleep } from './utils'
import { BybitClient } from './bybit/utils'

const client = new BybitClient(config.BYBIT_KEY, config.BYBIT_SECRET)
async function main() {
  const response = await client.placeMarketOrder('MNTUSD', 'Buy', 2)

  await sleep(1000 * 2)

  const details = await client.getOrderDetails(response.orderId)

  console.log(details)
}
main()
