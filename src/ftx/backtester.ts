import BigNumber from 'bignumber.js';
import { generateIndicators } from '../generateIndicators';
import mysql from '../mysql';
import { Market } from '../types/ftx';
import { orderObject, OrderTypes, Rule } from '../types/trading';
import { calculateProfit, getMarkets } from './utils';

const sqlClientFtx = new mysql('ftx');
const sqlClientStorage = new mysql('storage');

//variables
const startTime = new Date();
startTime.setDate(startTime.getDate() - 28);
//startTime.setHours(startTime.getHours() - 5);
const rulesToTest = ['test', 'test2', 'test3', 'test4', 'test5', 'test6', 'test7', 'test8']
let startInvest = 500
const leverage = +(process.env.LEVERAGE || 5);
let endTime

(async () => {
    await sqlClientStorage.emptyTable('backtester')
    const allMarkets = await getMarkets()
    const markets = allMarkets.filter((item: Market) => item['futureType'] === 'perpetual').sort(function (a: Market, b: Market) { return b['volumeUsd24h'] - a['volumeUsd24h']})
    const symbols = [...new Set(markets.map((item: Market) => item['name']))]

    const tables: {
            [key: string]: {}
        } = {}

    //for every symbol
    for (const symbol of symbols) {
        console.info(`Backtesting ${symbol}`)
        const history = await sqlClientFtx.getPriceHistory(symbol, `WHERE time >= ${startTime.getTime()}`)

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
        for (const {time: timestamp, close: price} of history) {
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

            //if (storage['test']?.transactions.length >= 4) throw 'stop'
            //console.log(indicators25min.MACD.MACD! / indicators25min.MACD.signal!, indicators25min.MACD.histogram!, indicators5min['EMA_55'], price)

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

                const profitThreshold = netProfitPercentage > 0.5 * leverage || netProfitPercentage < -1 * leverage
                //const profitThreshold3 = netProfitPercentage > 0.7 * leverage || netProfitPercentage < -1 * leverage
                //enable rules in rulesToTest
                const rules: {
                   [key: string]: Rule
                } = {
                    'test': {
                        'Long Entry': [[
                            indicators25min['MACD']['histogram']! < -0.15,
                        ], [
                            indicators25min['MACD']['histogram']! > 0,
                            indicators25min['MACD']['histogram']! > indicators25min['MACD_prev']['histogram']!,
                            indicators25min['RSI'] < 50,
                            indicators5min['MACD']['histogram']! > 0,
                            indicators60min['EMA_8'] > indicators60min['EMA_13'],
                       ]],
                       'Long Exit': [[
                            profitThreshold
                       ]],
                       'Short Entry': [[
                            indicators25min['MACD']['histogram']! > 0.15,
                        ], [
                            indicators25min['MACD']['histogram']! < 0,
                            indicators25min['MACD']['histogram']! < indicators25min['MACD_prev']['histogram']!,
                            indicators25min['RSI'] > 50,
                            indicators5min['MACD']['histogram']! < 0,
                            indicators60min['EMA_8'] < indicators60min['EMA_13'],
                       ]],
                       'Short Exit': [[
                            profitThreshold
                       ]]
                    },
                    'test2': {
                        'Long Entry': [[
                            indicators25min['MACD']['MACD']! / indicators25min['MACD']['signal']! < -0.2,
                        ], [
                            indicators25min['MACD']['histogram']! > 0,
                            indicators25min['MACD']['histogram']! > indicators25min['MACD_prev']['histogram']!,
                            indicators25min['RSI'] < 50,
                            indicators5min['MACD']['histogram']! > 0,
                            indicators60min['EMA_8'] > indicators60min['EMA_21'],
                       ]],
                       'Long Exit': [[
                            profitThreshold
                       ]],
                       'Short Entry': [[
                            indicators25min['MACD']['MACD']! / indicators25min['MACD']['signal']! > 0.2,
                        ], [
                            indicators25min['MACD']['histogram']! < 0,
                            indicators25min['MACD']['histogram']! < indicators25min['MACD_prev']['histogram']!,
                            indicators25min['RSI'] > 50,
                            indicators5min['MACD']['histogram']! < 0,
                            indicators60min['EMA_8'] < indicators60min['EMA_21'],
                       ]],
                       'Short Exit': [[
                            profitThreshold
                       ]]
                    },
                    'test3': {
                        'Long Entry': [[
                            indicators25min['MACD']['histogram']! < -0.15,
                        ], [
                            indicators25min['MACD']['histogram']! > 0,
                            indicators25min['MACD']['histogram']! > indicators25min['MACD_prev']['histogram']!,
                            indicators25min['RSI'] < 50,
                            indicators5min['MACD']['histogram']! > 0,
                            indicators60min['EMA_8'] > indicators60min['EMA_21'],
                       ]],
                       'Long Exit': [[
                            profitThreshold
                       ]],
                       'Short Entry': [[
                            indicators25min['MACD']['histogram']! > 0.15,
                        ], [
                            indicators25min['MACD']['histogram']! < 0,
                            indicators25min['MACD']['histogram']! < indicators25min['MACD_prev']['histogram']!,
                            indicators25min['RSI'] > 50,
                            indicators5min['MACD']['histogram']! < 0,
                            indicators60min['EMA_8'] < indicators60min['EMA_21'],
                       ]],
                       'Short Exit': [[
                            profitThreshold
                       ]]
                    },
                    'test4': {
                        'Long Entry': [[
                            indicators25min['MACD']['histogram']! < -0.15,
                        ], [
                            indicators25min['MACD']['histogram']! > 0,
                            indicators25min['RSI'] < 50,
                            indicators5min['MACD']['histogram']! > 0,
                            indicators60min['EMA_8'] > indicators60min['EMA_13'],
                       ]],
                       'Long Exit': [[
                            profitThreshold
                       ]],
                       'Short Entry': [[
                            indicators25min['MACD']['histogram']! > 0.15,
                        ], [
                            indicators25min['MACD']['histogram']! < 0,
                            indicators25min['RSI'] > 50,
                            indicators5min['MACD']['histogram']! < 0,
                            indicators60min['EMA_8'] < indicators60min['EMA_13'],
                       ]],
                       'Short Exit': [[
                            profitThreshold
                       ]]
                    },
                    'test5': {
                        'Long Entry': [[
                            indicators60min['MACD']['histogram']! < -0.15,
                        ], [
                            indicators60min['MACD']['histogram']! > 0,
                            indicators60min['RSI'] < 50,
                            indicators25min['MACD']['histogram']! > 0,
                            indicators60min['EMA_8'] > indicators60min['EMA_13'],
                       ]],
                       'Long Exit': [[
                            profitThreshold
                       ]],
                       'Short Entry': [[
                            indicators60min['MACD']['histogram']! > 0.15,
                        ], [
                            indicators60min['MACD']['histogram']! < 0,
                            indicators60min['RSI'] > 50,
                            indicators25min['MACD']['histogram']! < 0,
                            indicators60min['EMA_8'] < indicators60min['EMA_13'],
                       ]],
                       'Short Exit': [[
                            profitThreshold
                       ]]
                    },
                    'test6': {
                        'Long Entry': [[
                            indicators25min['MACD']['histogram']! < -0.15,
                        ], [
                            indicators25min['MACD']['histogram']! > 0,
                            indicators25min['RSI'] < 50,
                            indicators5min['MACD']['histogram']! > 0,
                            indicators25min['EMA_8'] > indicators25min['EMA_13'],
                            indicators60min['STOCH_RSI']['k'] > indicators60min['STOCH_RSI']['d']
                       ]],
                       'Long Exit': [[
                            profitThreshold
                       ]],
                       'Short Entry': [[
                            indicators25min['MACD']['histogram']! > 0.15,
                        ], [
                            indicators25min['MACD']['histogram']! < 0,
                            indicators25min['RSI'] > 50,
                            indicators5min['MACD']['histogram']! < 0,
                            indicators25min['EMA_8'] < indicators25min['EMA_13'],
                            indicators60min['STOCH_RSI']['k'] < indicators60min['STOCH_RSI']['d']
                       ]],
                       'Short Exit': [[
                            profitThreshold
                       ]]
                    },
                    'test7': {
                        'Long Entry': [[
                            indicators25min['MACD']['MACD']! / indicators25min['MACD']['signal']! < -0.2,
                        ], [
                            indicators25min['MACD']['histogram']! > 0,
                            indicators25min['MACD']['histogram']! > indicators25min['MACD_prev']['histogram']!,
                            indicators25min['RSI'] < 50,
                            indicators5min['MACD']['histogram']! > 0,
                            indicators25min['EMA_8'] > indicators25min['EMA_13'],
                       ]],
                       'Long Exit': [[
                            profitThreshold
                       ]],
                       'Short Entry': [[
                            indicators25min['MACD']['MACD']! / indicators25min['MACD']['signal']! > 0.2,
                        ], [
                            indicators25min['MACD']['histogram']! < 0,
                            indicators25min['MACD']['histogram']! < indicators25min['MACD_prev']['histogram']!,
                            indicators25min['RSI'] > 50,
                            indicators5min['MACD']['histogram']! < 0,
                            indicators25min['EMA_8'] < indicators25min['EMA_13'],
                       ]],
                       'Short Exit': [[
                            profitThreshold
                       ]]
                    },
                    'test8': {
                        'Long Entry': [[
                            indicators25min['MACD']['MACD']! / indicators25min['MACD']['signal']! < -0.2,
                        ], [
                            indicators25min['MACD']['histogram']! > 0,
                            indicators25min['MACD']['histogram']! > indicators25min['MACD_prev']['histogram']!,
                            indicators25min['RSI'] < 50,
                            indicators5min['MACD']['histogram']! > 0,
                            indicators60min['EMA_8'] > indicators60min['EMA_13'],
                       ]],
                       'Long Exit': [[
                            profitThreshold
                       ]],
                       'Short Entry': [[
                            indicators25min['MACD']['MACD']! / indicators25min['MACD']['signal']! > 0.2,
                        ], [
                            indicators25min['MACD']['histogram']! < 0,
                            indicators25min['MACD']['histogram']! < indicators25min['MACD_prev']['histogram']!,
                            indicators25min['RSI'] > 50,
                            indicators5min['MACD']['histogram']! < 0,
                            indicators60min['EMA_8'] < indicators60min['EMA_13'],
                       ]],
                       'Short Exit': [[
                            profitThreshold
                       ]]
                    },
                }

                const details = {
                    '25m EMA_8 > EMA_55': indicators25min['EMA_8'] / indicators25min['EMA_55'],
                    '25m RSI': indicators25min['RSI'],
                    '60m RSI': indicators60min['RSI'],
                }

                //there is an entry
                const hasOpenPosition = latestTransaction && latestTransaction['type'].includes('Entry')

                if (hasOpenPosition) {
                    const diff = (timestamp - prevTimestamp) / 1000 / 60
                    if (diff > 5 && profitThreshold) {
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
                    await checkRule(rule, 'Long Entry')
                    await checkRule(rule, 'Short Entry')
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
            prevTimestamp = timestamp
        }
        if (!endTime) endTime = new Date(history[history.length - 1]['time']).getTime()
    }
})()


async function checkIfTriggered(array: boolean[]) {
    if (array.length === array.filter((item) => item).length) return true
    else return false
}