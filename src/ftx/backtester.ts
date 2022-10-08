import { generateIndicators } from '../generateIndicators';
import mysql from '../mysql';
import { Market } from '../types/ftx';
import { orderObject, OrderTypes, Rule } from '../types/trading';
import { calculateProfit, getMarkets } from './utils';

process.on('unhandledRejection', async (e: any) => {
    console.error('unhandledRejection', e)
    process.exit(1)
})

const sqlClientFtx = new mysql('ftx');
const sqlClientStorage = new mysql('storage');

//variables
const startTime = new Date();
startTime.setDate(startTime.getDate() - 35);
//startTime.setHours(startTime.getHours() - 0.2);
const rulesToTest = ['test', 'test2', 'test3', 'test4', 'test5', 'test6', 'test7', 'test8', 'test9', 'test10', 'test11', 'test12', 'test13', 'test14', 'test15', 'test16', 'test17', 'test18']
let startInvest = 500
const leverage = +(process.env.LEVERAGE || 5);
let endTime: number | undefined

async function main() {
    await sqlClientStorage.emptyTable('backtester')
    const allMarkets = await getMarkets()
    const markets = allMarkets.filter((item: Market) => item['futureType'] === 'perpetual').sort(function (a: Market, b: Market) { return b['volumeUsd24h'] - a['volumeUsd24h']})
    const symbols = [...new Set(markets.map((item: Market) => item['name']))].slice(0, 20)

    const tables: {
            [key: string]: {}
        } = {}

    //for every symbol
    for (const symbol of symbols) {
        console.info(`Backtesting ${symbol}`)
        const history = await sqlClientFtx.getPriceHistory(symbol, `WHERE time >= ${startTime.getTime()}`)
        if (!history.length) continue

        const storage: {
            [key: string]: {
                transactions: orderObject[]
                indexes: {
                    'Long Entry': number
                    'Long Exit': number
                    'Short Entry': number
                    'Short Exit': number
                }
            }
        } = {}

        //iterate over history
        let prevTimestamp = history[0]['time']
        let lastSkip: number | null = null
        for (const {time: timestamp, close: price} of history) {
            const diff = (timestamp - prevTimestamp) / 1000 / 60
            prevTimestamp = timestamp

            console.clear()
            //console.log('\n\n')
            console.log(`${new Date(timestamp).toLocaleString()} | Testing ${symbol}`)
            console.log(`Start: ${startTime.toLocaleString()} | End: ${endTime ? new Date(endTime).toLocaleString() : null} | Leverage ${leverage}`)
            console.table(tables)

            const [indicators5min,indicators25min,indicators60min] = await Promise.all([
                generateIndicators(symbol, 5, timestamp),
                generateIndicators(symbol, 25, timestamp),
                generateIndicators(symbol, 60, timestamp)
            ])

            if (endTime && timestamp > endTime) break
            if (!indicators5min || !indicators25min || !indicators60min) continue

            //if (storage['test']?.transactions.length >= 4) throw 'stop'
            //console.log(indicators25min['MACD']['histogram']! / price, indicators25min['MACD']['histogram']!)
            //console.log(Math.abs(indicators25min.MACD.MACD!) / Math.abs(indicators25min.MACD.signal!), indicators25min.MACD.MACD! > indicators25min.MACD.signal!, indicators25min.MACD.MACD!, indicators25min.MACD.signal!)

            //iterate over rules
            for (const rule of rulesToTest) {
                if (!storage[rule]) storage[rule] = {
                    transactions: [],
                    indexes: {
                        'Long Entry': 0,
                        'Long Exit': 0,
                        'Short Entry': 0,
                        'Short Exit': 0
                    }
                }

                const transactions = storage[rule]['transactions']
                const latestTransaction = transactions[transactions.length - 1]
                const holdDuration = latestTransaction ? (timestamp - latestTransaction['timestamp']) / 1000 / 60 : 0

                let {
                    fee, 
                    netProfit, 
                    priceChange, 
                    netProfitPercentage, 
                    netInvest
                } = await calculateProfit(latestTransaction, price)

                const takeProfit = netProfitPercentage > 0.5 * leverage
                const stopLoss = netProfitPercentage < -1 * leverage
                const profitThreshold = takeProfit || stopLoss

                const lastProfit = latestTransaction?.action.includes('Exit') ? latestTransaction.netProfitPercentage! : null
                const wasLastTransactionProfitable = lastProfit && lastProfit > 0
                const waitAfterLoss: boolean = wasLastTransactionProfitable ? false : timestamp - latestTransaction?.timestamp! < 1000 * 60 * 60 * 5
                //const trailing = 
                const profitThreshold2 = takeProfit || netProfitPercentage < -2 * leverage || (holdDuration > 180 && netProfitPercentage > 0.2 * leverage)
                const profitThreshold3 = takeProfit || (holdDuration > 180 && netProfitPercentage > 0.2 * leverage)
                const profitThreshold4 = takeProfit || (holdDuration > 180 && netProfitPercentage > 0.2 * leverage) || (holdDuration > 360 && netProfitPercentage > -0.5 * leverage)
                //const profitThreshold3 = netProfitPercentage > 0.75 || netProfitPercentage < -0.5 * leverage
                //const profitThreshold3 = netProfitPercentage > 0.5 * leverage || netProfitPercentage < -1 * leverage || (netProfitPercentage > 0.35 * leverage && holdDuration > 30)
                //enable rules in rulesToTest
                const rules: {
                   [key: string]: Rule
                } = {
                    'correlation': {
                        'Long Entry': [[false]],
                        'Long Exit': [[]],
                        'Short Entry': [[false]],
                        'Short Exit': [[]]
                    },
                    'test': {
                        'Long Entry': [[
                            price < indicators25min['bollingerBands']['lower'],
                        ]],
                       'Long Exit': [[
                            netProfitPercentage > 0.5 * leverage ||
                            price >= indicators25min['bollingerBands']['upper']
                       ]],
                       'Short Entry': [[false]],
                       'Short Exit': [[]]
                    },
                    'test2': {
                        'Long Entry': [[
                            price < indicators25min['bollingerBands']['lower'],
                        ]],
                       'Long Exit': [[
                            netProfitPercentage > 0.6 * leverage ||
                            price >= indicators25min['bollingerBands']['upper']
                       ]],
                       'Short Entry': [[false]],
                       'Short Exit': [[]]
                    },
                    'test3': {
                        'Long Entry': [[
                            indicators25min['MACD']['histogram']! < -0.25,
                        ], [
                            indicators25min['MACD']['histogram']! > 0,
                            indicators25min['RSI'] < 50,
                            indicators5min['MACD']['histogram']! > 0,
                            indicators60min['EMA_8'] > indicators60min['EMA_13'],
                       ]],
                       'Long Exit': [[
                            profitThreshold
                       ]],
                       'Short Entry': [[false]],
                       'Short Exit': [[
                            profitThreshold
                       ]]
                    },
                    'test4': {
                        'Long Entry': [[
                            indicators5min['MACD']['histogram']! < 0,
                            indicators5min['MACD']['signal']! < 0
                        ], [
                            indicators5min['MACD']['histogram']! > 0,
                            indicators5min['close'] > indicators5min['open'],
                            indicators25min['EMA_8'] > indicators25min['EMA_13'],
                        ]],
                       'Long Exit': [[
                            profitThreshold
                       ]],
                       'Short Entry': [[false]],
                       'Short Exit': [[]]
                    },
                    'test5': {
                        'Long Entry': [[
                            indicators25min['ADX']['pdi']! > indicators25min['ADX']['mdi']!,
                            indicators25min['ADX']['adx']! > 25,
                            indicators25min['MACD']['histogram']! > indicators25min['MACD_prev']['histogram']!,
                        ]],
                       'Long Exit': [[
                            profitThreshold
                       ]],
                       'Short Entry': [[false]],
                       'Short Exit': [[
                            profitThreshold
                       ]]
                    },
                    'test6': {
                        'Long Entry': [[
                            indicators60min['MACD']['histogram']! < 0
                        ], [
                            indicators60min['MACD']['histogram']! > 0,
                            indicators25min['MACD']['histogram']! > indicators25min['MACD_prev']['histogram']!,
                            indicators25min['EMA_8'] > indicators25min['EMA_13'],
                        ]],
                       'Long Exit': [[
                            profitThreshold
                       ]],
                       'Short Entry': [[false]],
                       'Short Exit': [[
                            profitThreshold
                       ]]
                    },
                    'test7': {
                        'Long Entry': [[
                            waitAfterLoss,
                            price < indicators25min['bollingerBands']['lower'],
                        ], [
                            price > indicators25min['bollingerBands']['lower'],
                        ]],
                       'Long Exit': [[
                            profitThreshold3 ||
                            price >= indicators25min['bollingerBands']['upper']
                       ]],
                       'Short Entry': [[
                            waitAfterLoss,
                            price > indicators25min['bollingerBands']['upper'],
                       ], [
                            price < indicators25min['bollingerBands']['upper'],
                       ]],
                       'Short Exit': [[
                            profitThreshold3 ||
                            price <= indicators25min['bollingerBands']['lower']
                       ]]
                    },
                    'test8': {
                        'Long Entry': [[
                            indicators25min['ADX']['pdi']! > indicators25min['ADX']['mdi']!,
                            indicators25min['ADX']['adx']! > 25,
                            indicators25min['MACD']['histogram']! > indicators25min['MACD_prev']['histogram']!,
                            indicators60min['MACD']['histogram']! > 0
                        ]],
                       'Long Exit': [[
                            profitThreshold ||
                            indicators25min['ADX']['pdi']! < indicators25min['ADX']['mdi']!,
                       ]],
                       'Short Entry': [[false]],
                       'Short Exit': [[
                            profitThreshold
                       ]]
                    },
                    'test9': {
                        'Long Entry': [[
                            price < indicators25min['bollingerBands']['lower'],
                            indicators25min['MACD']['histogram']! > indicators25min['MACD_prev']['histogram']!,
                        ]],
                       'Long Exit': [[
                            netProfitPercentage > 0.5 * leverage ||
                            price >= indicators25min['bollingerBands']['upper']
                       ]],
                       'Short Entry': [[false]],
                       'Short Exit': [[]]
                    },
                    'test10': {
                        'Long Entry': [[
                            price < indicators25min['bollingerBands']['lower'],
                        ]],
                       'Long Exit': [[
                            netProfitPercentage > 0.5 * leverage ||
                            price >= indicators25min['bollingerBands']['upper']
                       ]],
                       'Short Entry': [[
                            price > indicators25min['bollingerBands']['upper'],
                       ]],
                       'Short Exit': [[
                            netProfitPercentage > 0.5 * leverage ||
                            price <= indicators25min['bollingerBands']['lower']
                       ]]
                    },
                    'test11': {
                        'Long Entry': [[
                            price < indicators25min['bollingerBands']['lower'],
                        ]],
                       'Long Exit': [[
                            profitThreshold2 ||
                            price >= indicators25min['bollingerBands']['upper']
                       ]],
                       'Short Entry': [[
                            price > indicators25min['bollingerBands']['upper'],
                       ]],
                       'Short Exit': [[
                            profitThreshold2 ||
                            price <= indicators25min['bollingerBands']['lower']
                       ]]
                    },
                    'test12': {
                        'Long Entry': [[
                            price < indicators25min['bollingerBands']['lower'],
                        ]],
                       'Long Exit': [[
                            profitThreshold3 ||
                            price >= indicators25min['bollingerBands']['upper']
                       ]],
                       'Short Entry': [[
                            price > indicators25min['bollingerBands']['upper'],
                       ]],
                       'Short Exit': [[
                            profitThreshold3 ||
                            price <= indicators25min['bollingerBands']['lower']
                       ]]
                    },
                    'test13': {
                        'Long Entry': [[
                            price < indicators25min['bollingerBands']['lower'],
                        ], [
                            price > indicators25min['bollingerBands']['lower'],
                        ]],
                       'Long Exit': [[
                            profitThreshold3 ||
                            price >= indicators25min['bollingerBands']['upper']
                       ]],
                       'Short Entry': [[
                            price > indicators25min['bollingerBands']['upper'],
                       ], [
                            price < indicators25min['bollingerBands']['upper'],
                       ]],
                       'Short Exit': [[
                            profitThreshold3 ||
                            price <= indicators25min['bollingerBands']['lower']
                       ]]
                    },
                    'test14': {
                        'Long Entry': [[
                            !waitAfterLoss,
                            price < indicators25min['bollingerBands']['lower'],
                        ], [
                            price > indicators25min['bollingerBands']['lower'],
                        ]],
                       'Long Exit': [[
                            profitThreshold3 ||
                            netProfitPercentage < -5 * leverage ||
                            price >= indicators25min['bollingerBands']['upper']
                       ]],
                       'Short Entry': [[
                            !waitAfterLoss,
                            price > indicators25min['bollingerBands']['upper'],
                       ], [
                            price < indicators25min['bollingerBands']['upper'],
                       ]],
                       'Short Exit': [[
                            profitThreshold3 ||
                            netProfitPercentage < -5 * leverage ||
                            price <= indicators25min['bollingerBands']['lower']
                       ]]
                    },
                    'test15': {
                        'Long Entry': [[
                            !waitAfterLoss,
                            price < indicators25min['bollingerBands']['lower'],
                        ], [
                            price > indicators25min['bollingerBands']['lower'],
                        ]],
                       'Long Exit': [[
                            profitThreshold4 ||
                            netProfitPercentage < -5 * leverage ||
                            price >= indicators25min['bollingerBands']['upper']
                       ]],
                       'Short Entry': [[
                            !waitAfterLoss,
                            price > indicators25min['bollingerBands']['upper'],
                       ], [
                            price < indicators25min['bollingerBands']['upper'],
                       ]],
                       'Short Exit': [[
                            profitThreshold4 ||
                            netProfitPercentage < -5 * leverage ||
                            price <= indicators25min['bollingerBands']['lower']
                       ]]
                    },
                    'test16': {
                        'Long Entry': [[
                            !waitAfterLoss,
                            price < indicators25min['bollingerBands']['lower'],
                        ], [
                            price > indicators25min['bollingerBands']['lower'],
                            indicators60min['MACD']['histogram']! > indicators60min['MACD_prev']['histogram']!
                        ]],
                       'Long Exit': [[
                            profitThreshold3 ||
                            price >= indicators25min['bollingerBands']['upper']
                       ]],
                       'Short Entry': [[
                            !waitAfterLoss,
                            price > indicators25min['bollingerBands']['upper'],
                       ], [
                            price < indicators25min['bollingerBands']['upper'],
                            indicators60min['MACD']['histogram']! < indicators60min['MACD_prev']['histogram']!
                       ]],
                       'Short Exit': [[
                            profitThreshold3 ||
                            price <= indicators25min['bollingerBands']['lower']
                       ]]
                    },
                    'test17': {
                        'Long Entry': [[
                            !waitAfterLoss,
                            price < indicators25min['bollingerBands']['lower'],
                        ], [
                            price > indicators25min['bollingerBands']['lower'],
                            indicators60min['MACD']['histogram']! > indicators60min['MACD_prev']['histogram']!
                        ]],
                       'Long Exit': [[
                            profitThreshold4 ||
                            price >= indicators25min['bollingerBands']['upper']
                       ]],
                       'Short Entry': [[
                            !waitAfterLoss,
                            price > indicators25min['bollingerBands']['upper'],
                       ], [
                            price < indicators25min['bollingerBands']['upper'],
                            indicators60min['MACD']['histogram']! < indicators60min['MACD_prev']['histogram']!
                       ]],
                       'Short Exit': [[
                            profitThreshold4 ||
                            price <= indicators25min['bollingerBands']['lower']
                       ]]
                    },
                    'test18': {
                        'Long Entry': [[
                            !waitAfterLoss,
                            price < indicators25min['bollingerBands']['lower'],
                        ], [
                            price > indicators25min['bollingerBands']['lower'],
                            indicators60min['MACD']['histogram']! > indicators60min['MACD_prev']['histogram']!
                        ]],
                       'Long Exit': [[
                            profitThreshold4 ||
                            netProfitPercentage < -2 * leverage ||
                            price >= indicators25min['bollingerBands']['upper']
                       ]],
                       'Short Entry': [[
                            !waitAfterLoss,
                            price > indicators25min['bollingerBands']['upper'],
                       ], [
                            price < indicators25min['bollingerBands']['upper'],
                            indicators60min['MACD']['histogram']! < indicators60min['MACD_prev']['histogram']!
                       ]],
                       'Short Exit': [[
                            profitThreshold4 ||
                            netProfitPercentage < -2 * leverage ||
                            price <= indicators25min['bollingerBands']['lower']
                       ]]
                    },
                }

                if (!rules[rule]) continue

                const details = {
                    '5m histogram': indicators5min['MACD']['histogram']!,
                    '5m EMA_8 / EMA_55': indicators5min['EMA_8'] / indicators5min['EMA_55'],
                    '5m RSI': indicators5min['RSI'],
                    '5m close / open': indicators5min['close'] / indicators5min['open'],
                    '25m EMA_8 / EMA_55': indicators25min['EMA_8'] / indicators25min['EMA_55'],
                    '25m RSI': indicators25min['RSI'],
                    '25m histogram': indicators25min['MACD']['histogram']!,
                    '25m price / EMA_8': price / indicators25min['EMA_8'],
                    '25m volume': indicators25min['volume'],
                    '25m close / open': indicators25min['close'] / indicators25min['open'],
                    '60m RSI': indicators60min['RSI'],
                    '60m EMA_8 / EMA_55': indicators60min['EMA_8'] / indicators60min['EMA_55'],
                    '60m histogram': indicators60min['MACD']['histogram']!,
                    '60m price / BB lower': price / indicators60min['bollingerBands']['lower'],
                    '60m price / BB upper': price / indicators60min['bollingerBands']['upper'],
                    '60m ADX pdi / mdi': indicators60min['ADX']['pdi'] / indicators60min['ADX']['mdi'],
                    '60m ADL': indicators60min['ADL'],
                    '60m volume': indicators60min['volume'],
                }

                //there is an entry
                const hasOpenPosition = latestTransaction && latestTransaction['type'].includes('Entry')

                if (hasOpenPosition) {
                    if (diff > 5) {
                        lastSkip = timestamp
                        //remove last transaction
                        console.warn('removed latest entry due to skip in price database')
                        const removedTrx = storage[rule].transactions.pop()
                        if (removedTrx) await sqlClientStorage.deleteTransaction(removedTrx['orderId'])
                        continue
                    }
                    if (latestTransaction['type'].includes('Long')) {
                        await checkRule(rule, 'Long Exit')
                    } else {
                        await checkRule(rule, 'Short Exit')
                    }
                } else {
                    if (diff > 5) {
                        lastSkip = timestamp
                        console.log('missing price data, diff:', diff)
                        continue
                    }
                    //lastSkip at least 90min ago
                    if (lastSkip && timestamp - lastSkip < 1000 * 60 * 90) {
                        console.log('skipped due to last skip less than 30m ago')
                        continue
                    }
                    await checkRule(rule, 'Long Entry')
                    await checkRule(rule, 'Short Entry')
                }

                if (rule === 'correlation' && timestamp / 1000 / 60 % 25 === 0) {
                    const startTime = timestamp - (1000 * 60 * 30) //30min
                    const temp = history.filter(item => item.time <= timestamp && item.time >= startTime)
                    const max = Math.max(...temp.map(item => item['close']))
                    const min = Math.min(...temp.map(item => item['close']))

                    let obj: orderObject = {
                        price,
                        timestamp,
                        type: '',
                        action: '',
                        symbol,
                        invest: (netInvest || startInvest) * leverage,
                        netInvest: netInvest || startInvest,
                        size: 0,
                        fee: 0,
                        platform: 'ftx',
                        avgPrice: price,
                        status: 'DEMO',
                        index: rule.match(/\d+/) ? +rule.match(/\d+/)![0] : undefined,
                        rule,
                        orderId: Math.random().toString(36),
                        details,
                    }

                    const feeDecimal = process.env.FTX_FEE || 0.000665
                    obj['fee'] = obj['invest'] * +feeDecimal

                    if (price / max < 0.994 && price / min < 1.01) {
                        //short profit and no loss
                        obj['type'] = 'Short Exit'
                        obj['action'] = 'Short Exit'
                        await sqlClientStorage.writeTransaction({
                            ...obj,
                            ...await calculateProfit({
                                type: 'Short Entry',
                                invest: obj['invest'],
                                netInvest: obj['netInvest'],
                                fee: obj['fee'],
                                price: max,
                            }, price)
                        })
                    }
                    if (price / min > 1.006 && price / max > 0.99) {
                        //long profit and no loss
                        obj['type'] = 'Long Exit'
                        obj['action'] = 'Long Exit'
                        await sqlClientStorage.writeTransaction({
                            ...obj,
                            ...await calculateProfit({
                                type: 'Long Entry',
                                invest: obj['invest'],
                                netInvest: obj['netInvest'],
                                fee: obj['fee'],
                                price: min,
                            }, price)
                        })
                    }
                }

                async function checkRule(rule: string, type: OrderTypes) {
                    const ruleIndex = storage[rule]['indexes'][type]
                    
                    const triggered = await checkIfTriggered(rules[rule][type][ruleIndex])

                    if (triggered) {
                        storage[rule]['indexes'][type]++
                        
                        if (storage[rule]['indexes'][type] >= rules[rule][type].length) {
                            let invest = startInvest * leverage
                            if (latestTransaction) invest = netInvest * leverage
                            //execute order
                            const feeDecimal = process.env.FTX_FEE || 0.000665
                            if (!fee) fee = invest * +feeDecimal

                            let obj: orderObject = {
                                price,
                                timestamp,
                                type,
                                action: type,
                                symbol,
                                invest,
                                netInvest: netInvest || startInvest,
                                size: invest / price,
                                fee,
                                platform: 'ftx',
                                avgPrice: price,
                                status: 'DEMO',
                                index: rule.match(/\d+/) ? +rule.match(/\d+/)![0] : undefined,
                                rule,
                                orderId: Math.random().toString(36),
                                details
                            }

                            if (type.includes('Exit')) {
                                obj['feeSum'] = fee + latestTransaction['fee']
                                obj['netProfit'] = netProfit
                                obj['netProfitPercentage'] = netProfitPercentage
                                obj['priceChange'] = priceChange
                                obj['entryId'] = latestTransaction['entryId']
                                obj['holdDuration'] = holdDuration
                                obj['entryDetails'] = latestTransaction['details']
                            }

                            storage[rule]['transactions'].push(obj)

                            if (process.env.WRITE_TO_DB) await sqlClientStorage.writeTransaction(obj)

                            storage[rule]['indexes'] = {
                               'Long Entry': 0,
                               'Long Exit': 0,
                               'Short Entry': 0,
                               'Short Exit': 0
                            }
                        }
                    }
                }
            }

            for (const rule in storage) {
                const transactions = storage[rule]['transactions']
                if (transactions.length < 1) continue
                const exits = transactions.filter((item: orderObject) => item['type'].includes('Exit'))

                const profit = exits.reduce((acc, item) => acc + item['netProfit']!, 0)
                const profitLong = exits.filter((item: orderObject) => item['type'].includes('Long')).reduce((acc, item) => acc + item['netProfit']!, 0)
                const feeTotal = exits.reduce((acc, item) => acc + item['feeSum']!, 0)

                const ratio = exits.filter((item) => item['netProfit']! > 0).length / exits.length

                //console.log(profits, profitPercentage, profitTotal)

                tables[`${transactions[0]['symbol'].replace('-PERP', '')} ${rule}`] = {
                    'Net Profit': profit.toFixed(2) + '$',
                    'Profit %': (profit / (transactions[0]['invest'] / leverage) * 100).toFixed(2) + '%',
                    'Profit Longs': (profitLong / (transactions[0]['invest'] / leverage) * 100).toFixed(2) + '%',
                    'Fee Total': feeTotal.toFixed(2) + '$',
                    'Transactions': transactions.length,
                    'Win Ratio': (ratio * 100).toFixed(0) + '%',
                }
            }
        }
        if (!endTime) endTime = new Date(history[history.length - 1]['time']).getTime()
    }

    endTime = undefined
    console.log('done testing')
    
    setTimeout(() => {
        main()
    }, 1000 * 60 * 60);
}

main()

async function checkIfTriggered(array: boolean[]) {
    if (array.length === array.filter((item) => item).length) return true
    else return false
}