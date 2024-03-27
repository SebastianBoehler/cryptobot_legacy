import { OrderHelper } from '../bybit/orderHelper'
//!IMPORTANT: will fail with updated fees, data from base fee tier

describe.only('run orderHelper tests', () => {
  //test are based on REAL okx trading data
  test('check margin & fee calculation', async () => {
    const symbol = '10000WENUSDT'
    const orderHelper = new OrderHelper(symbol, false)
    await orderHelper.getContractInfo()
    orderHelper.setLeverage(2)

    const usdAmount = 10
    orderHelper.update(4.7882, new Date())
    const order = await orderHelper.openOrder('long', usdAmount)
    const pos = orderHelper.position

    if (!order) throw new Error('no order')

    expect(order.size).toBe(4)
    expect(order.fee).toBe(-0.01053404)

    expect(pos?.orders.length).toBe(1)
    expect(pos?.orders[0].size).toBe(4)
    expect(pos?.leverage).toBe(2)
    expect(pos?.avgEntryPrice).toBe(4.7882)
  })

  //check for profit calculation order.bruttoPnlUSD especially
})
