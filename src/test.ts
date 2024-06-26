import { RestClientV5 } from 'bybit-api'
import config from './config/config'

const client = new RestClientV5({
  key: config.BYBIT_KEY,
  secret: config.BYBIT_SECRET,
})

async function main() {
  const positions = await client.getPositionInfo({ category: 'linear' })
  console.log(positions)
}

main()
