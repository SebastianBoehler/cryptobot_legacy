import { RestClientV5 } from 'bybit-api'
import config from './config/config'

const symbol = '10000WENUSDT'

const client = new RestClientV5({
  key: config.BYBIT_KEY,
  secret: config.BYBIT_SECRET,
})

async function main() {
  let orders: any[] = []
  const { result } = await client.getHistoricOrders({
    symbol,
    limit: 50,
    endTime: new Date().getTime(),
    category: 'linear',
  })

  orders = [...orders, ...result.list].sort((a, b) => +a.createdTime - +b.createdTime)

  console.log(orders.length)
  if (orders.length > 0) {
    console.log(new Date(+orders[0].createdTime))
    console.log(new Date(+orders[orders.length - 1].createdTime))
  }

  const { result: result2 } = await client.getHistoricOrders({
    symbol,
    limit: 50,
    endTime: orders[0].createdTime,
    category: 'linear',
  })

  const sorted2 = result2.list.sort((a, b) => +a.createdTime - +b.createdTime)

  console.log(sorted2.length)
  if (sorted2.length > 0) {
    console.log(new Date(+sorted2[0].createdTime))
    console.log(new Date(+sorted2[sorted2.length - 1].createdTime))
  }
}

main()
