import { RestClient } from 'okx-api'
import config from './config/config'

const okxClient = new RestClient({
  apiKey: config.OKX_KEY,
  apiSecret: config.OKX_SECRET,
  apiPass: config.OKX_PASS,
})

async function main() {
  const resp = await okxClient.getAccountConfiguration()
  console.log(resp)
  process.exit(0)
}

main()
