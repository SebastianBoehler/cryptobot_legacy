import io from '@pm2/io'
import { LivePosition } from '../orderHelper'

const uPNL = io.metric({
  name: 'uPNL USD',
})
const PNL = io.metric({
  name: 'PNL USD',
})
const orders = io.metric({
  name: 'Orders',
})
const margin = io.metric({
  name: 'margin',
})

export const livePositionMetrics = (pos: LivePosition | null) => {
  if (!pos) {
    uPNL.set(undefined)
    PNL.set(undefined)
    orders.set(undefined)
    margin.set(undefined)
    return
  }

  uPNL.set(pos.unrealizedPnlUSD)
  PNL.set(pos.realizedPnlUSD)
  orders.set(pos.orders.length)
  margin.set(pos.margin)
}
