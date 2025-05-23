import { OrderHelper } from '../okx/orderHelper'

//!IMPORTANT: will fail with updated fees, data from base fee tier

describe('run orderHelper tests', () => {
  //test are based on REAL okx trading data
  test('check fee & margin calculation', async () => {
    const symbol = 'XRP-USDT-SWAP'
    const orderHelper = new OrderHelper(symbol, false)
    await orderHelper.getContractInfo()
    orderHelper.setLeverage(5, 'long', 1_000)

    const usdAmount = 45
    orderHelper.update(0.50172, new Date())
    const order = await orderHelper.openOrder('long', usdAmount)
    const pos = orderHelper.position
    if (!order) throw new Error('no order')

    expect(+order.fee.toFixed(6)).toBe(-0.100344)
    expect(order.size).toBe(4)
    expect(Math.floor(pos?.margin! * 100) / 100).toBe(40.13)

    const usdAmount1 = 65
    orderHelper.update(0.50175, new Date())
    const order1 = await orderHelper.openOrder('long', usdAmount1)
    const pos1 = orderHelper.position

    if (!order1) throw new Error('no order')
    expect(+order1.fee.toFixed(6)).toBe(-0.150525)
    expect(order1.size).toBe(6)
    expect(Number(pos1?.margin.toFixed(4))).toBe(100.3476)
    expect(pos1?.fee).toBe(-0.250869)
    expect(pos1?.ctSize).toBe(10)
    expect(Number(pos1?.avgEntryPrice.toFixed(6))).toBe(0.501738)

    orderHelper.update(0.50174, new Date())
    const order2 = await orderHelper.closeOrder(6)
    const pos2 = orderHelper.position

    expect(pos2?.orders.length).toBe(3)
    expect(+order2.fee.toFixed(6)).toBe(-0.150522)
    expect(order2.size).toBe(6)
    expect(+order2.bruttoPnlUSD.toFixed(4)).toBe(0.0012)
    expect(Number(pos2?.margin.toFixed(5))).toBe(40.13904)
    expect(pos2?.fee).toBe(-0.401391)
    expect(pos2?.ctSize).toBe(4)

    orderHelper.update(0.50148, new Date())
    const order3 = await orderHelper.closeOrder(4)
    const pos3 = orderHelper.position

    expect(pos3).toBe(null)
    expect(+order3.fee.toFixed(6)).toBe(-0.100296)
  })

  test('orderhelper should be exact as live trading with leverage increase', async () => {
    const symbol = 'API3-USDT-SWAP'
    const orderHelper = new OrderHelper(symbol, false)
    await orderHelper.getContractInfo()
    orderHelper.setLeverage(2, 'long', 1_000)

    const usdAmount = 15
    orderHelper.update(2.021, new Date())

    const ordId = 'init7F5yNEZHz1TTsC1gDiFsbOTT'
    const order = await orderHelper.openOrder('long', usdAmount, ordId)
    if (!order) throw new Error('no order')

    expect(+order.margin.toFixed(3)).toBe(14.147)
    expect(order.size).toBe(14)
    expect(order.ordId).toBe(ordId)
    expect(order.lever).toBe(2)
    expect(+order.fee.toFixed(6)).toBe(-0.014147)
    const pos = orderHelper.position
    expect(pos?.ctSize).toBe(14)

    await orderHelper.update(2.02, new Date())
    const order2 = await orderHelper.openOrder('long', usdAmount)
    if (!order2) throw new Error('no order')

    expect(order2.size).toBe(14)
    expect(order2.margin).toBe(14.14)
    expect(+order2.fee.toFixed(5)).toBe(-0.01414)

    if (!orderHelper.position) throw new Error('no position')
    expect(+orderHelper.position.margin.toFixed(3)).toBe(28.287)

    const marginPre = orderHelper.position?.margin
    await orderHelper.update(2.017, new Date())
    await orderHelper.setLeverage(4, 'long', 1_000)
    const marginPost = orderHelper.position?.margin

    const pos2 = orderHelper.position
    if (!pos2) throw new Error('no position')
    expect(pos2.leverage).toBe(4)
    expect(+pos2.unrealizedPnlUSD.toFixed(4)).toBe(-0.1263)

    const diff = marginPre! - marginPost!
    const order3 = await orderHelper.openOrder('long', diff)
    if (!order3) throw new Error('no order')

    expect(order3.size).toBe(27)
    expect(order3.lever).toBe(4)
    expect(+order3.margin.toFixed(4)).toBe(13.6147)

    await orderHelper.update(2.016, new Date())
    const order4 = await orderHelper.closeOrder(27)

    expect(order4.size).toBe(27)
    expect(order4.lever).toBe(4)
    expect(+order4.fee.toFixed(4)).toBe(-0.0272)

    await orderHelper.update(2.013, new Date())
    await orderHelper.closeOrder(28)

    const pos3 = orderHelper.position
    expect(pos3).toBe(null)
  })

  test('increasing and decreasing lever & margin', async () => {
    const symbol = 'FIL-USDT-SWAP'
    const orderHelper = new OrderHelper(symbol, false)
    await orderHelper.getContractInfo()
    orderHelper.setLeverage(2, 'long', 60)

    orderHelper.update(6.05, new Date())
    const order = await orderHelper.openOrder('long', 20)
    if (!order) throw new Error('no order')

    expect(order.size).toBe(66)
    expect(order.lever).toBe(2)
    expect(+order.margin).toBe(19.965)
    expect(+order.fee).toBe(-0.019965)

    orderHelper.setLeverage(3, 'long', 40.015035)
    orderHelper.setLeverage(4, 'long', 46.605035)

    const pos = orderHelper.position
    if (!pos) throw new Error('no position')
    expect(pos.margin).toBeGreaterThan(10.085)

    orderHelper.setLeverage(5, 'long', 49.895035)

    const pos2 = orderHelper.position
    if (!pos2) throw new Error('no position')
    expect(pos2.leverage).toBe(5)

    orderHelper.update(6.032, new Date())
    const order2 = await orderHelper.openOrder('long', 17.265011666666666)
    if (!order2) throw new Error('no order')

    expect(order2.size).toBe(143)
    expect(order2.lever).toBe(5)
    expect(+order2.margin.toFixed(5)).toBe(17.25152)

    orderHelper.setLeverage(4, 'long', 34.5003862)

    const pos3 = orderHelper.position
    if (!pos3) throw new Error('no position')

    expect(pos3.margin).toBeGreaterThan(31.97652)

    orderHelper.setLeverage(3, 'long', 27.9603862)

    const pos4 = orderHelper.position
    if (!pos4) throw new Error('no position')

    orderHelper.setLeverage(2, 'long', 17.3403862)

    const pos5 = orderHelper.position
    if (!pos5) throw new Error('no position')

    expect(pos5.margin).toBe(pos4.margin)
    expect(pos5.leverage).toBe(3)
  })
})
