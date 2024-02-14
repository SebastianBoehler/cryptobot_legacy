import io from '@pm2/io'
import { LivePosition } from '../orderHelper'
import { Position } from 'cryptobot-types'

const uPNL = io.metric({
  name: 'uPNL USD',
})
const orders = io.metric({
  name: 'Orders',
})
const margin = io.metric({
  name: 'margin',
})

export const livePositionMetrics = (pos: LivePosition | Position | null) => {
  if (!pos) {
    uPNL.set(undefined)
    orders.set(undefined)
    margin.set(undefined)
    return
  }

  uPNL.set(pos.unrealizedPnlUSD)
  orders.set(pos.orders.length)
  margin.set(pos.margin)
}
