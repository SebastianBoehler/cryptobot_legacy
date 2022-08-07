import { generateIndicators } from '../generateIndicators';
import mysql from '../mysql';
import { Market } from '../types/ftx';
import { orderObject, OrderTypes, Rule } from '../types/trading';
import { calculateProfit, getMarkets } from './utils';

const mysqlClient = new mysql('ftx');

//variables
const startTime = new Date();
startTime.setDate(startTime.getDate() - 21);
const rulesToTest = ['test', 'test2', 'test3', 'test4']
let startInvest = 500
const leverage = +(process.env.LEVERAGE || 5);

(async () => {
    const allMarkets = await getMarkets()
    const markets = allMarkets.filter((item: Market) => item['futureType'] === 'perpetual').sort(function (a: Market, b: Market) { return b['volumeUsd24h'] - a['volumeUsd24h']})
    const symbols = [...new Set(markets.map((item: Market) => item['name']))]

    const tables: {
            [key: string]: {}
        } = {}

    //for every symbol
    for (const symbol of symbols) {
        console.info(`Backtesting ${symbol}`)
        const history = await mysqlClient.getPriceHistory(symbol, `WHERE time >= ${startTime.getTime()}`)

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
        for (const {time: timestamp, price} of history) {
            console.clear()
            console.log(`${new Date(timestamp).toLocaleString()} | Testing ${symbol}`)
            console.table(tables)

            const [indicators5min,indicators25min] = await Promise.all([
                generateIndicators(symbol, 5, timestamp),
                generateIndicators(symbol, 25, timestamp),
            ])

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

                let {fee, netProfit, priceChange, netProfitPercentage, exitInvestSize} = await calculateProfit(latestTransaction, price)

                //enable rules in rulesToTest
                const rules: {
                   [key: string]: Rule
                } = {
                    'test': {
                        'Long Entry': [[
                            indicators25min['EMA_8'] < indicators25min['EMA_13'],
                        ], [
                            indicators25min['EMA_8'] > indicators25min['EMA_13'],
                       ]],
                       'Long Exit': [[
                            netProfitPercentage > 0.5 * leverage || netProfitPercentage < -1 * leverage
                       ]],
                       'Short Entry': [[false]],
                       'Short Exit': [[false]]
                    },
                    'test2': {
                        'Long Entry': [[
                            indicators25min['MACD']['histogram']! < 0,
                        ], [
                            indicators25min['MACD']['histogram']! > 0,
                            indicators25min['EMA_8'] > indicators25min['EMA_13'],
                       ]],
                       'Long Exit': [[
                            netProfitPercentage > 0.5 * leverage || netProfitPercentage < -1 * leverage
                       ]],
                       'Short Entry': [[false]],
                       'Short Exit': [[false]]
                    },
                    'test3': {
                        'Long Entry': [[
                            indicators25min['MACD']['histogram']! < 0,
                        ], [
                            indicators25min['MACD']['histogram']! > 0,
                            indicators25min['EMA_8'] > indicators25min['EMA_13'],
                       ]],
                       'Long Exit': [[
                            netProfitPercentage > 0.5 * leverage || netProfitPercentage < -1 * leverage
                       ]],
                       'Short Entry': [[
                            indicators25min['MACD']['histogram']! > 0,
                        ], [
                            indicators25min['MACD']['histogram']! < 0,
                            indicators25min['EMA_8'] < indicators25min['EMA_13'],
                       ]],
                       'Short Exit': [[
                            netProfitPercentage > 0.5 * leverage || netProfitPercentage < -1 * leverage
                       ]]
                    },
                    'test4': {
                        'Long Entry': [[
                            indicators25min['MACD']['histogram']! < 0,
                        ], [
                            indicators25min['MACD']['histogram']! > 0,
                            indicators5min['MACD']['histogram']! > 0,
                            indicators25min['EMA_8'] > indicators25min['EMA_13'],
                       ]],
                       'Long Exit': [[
                            netProfitPercentage > 0.5 * leverage || netProfitPercentage < -1 * leverage
                       ]],
                       'Short Entry': [[
                            indicators25min['MACD']['histogram']! > 0,
                        ], [
                            indicators25min['MACD']['histogram']! < 0,
                            indicators5min['MACD']['histogram']! < 0,
                            indicators25min['EMA_8'] < indicators25min['EMA_13'],
                       ]],
                       'Short Exit': [[
                            netProfitPercentage > 0.5 * leverage || netProfitPercentage < -1 * leverage
                       ]]
                    },
                }

                //there is an entry
                const hasOpenPosition = latestTransaction && latestTransaction['type'].includes('Entry')

                if (hasOpenPosition) {
                    //console.log(`${rule} profit: ${netProfit?.toFixed(2)}$ | ${netProfitPercentage.toFixed(2)}% ${priceChange!.toFixed(2)}% ${(priceChange! * leverage).toFixed(2)}% | Trxs: ${transactions.length} | Wallet: ${latestTransaction['invest']}`)

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
                            if (latestTransaction) invest = exitInvestSize
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
                                size: invest / price,
                                fee,
                                platform: 'ftx',
                                avgPrice: price,
                                status: 'DEMO',
                                index: rule.match(/\d+/) ? +rule.match(/\d+/)![0] : undefined
                            }

                            if (type.includes('Exit')) {
                                obj['feeSum'] = fee + latestTransaction['fee']
                                obj['netProfit'] = netProfit
                                obj['netProfitPercentage'] = netProfitPercentage
                                obj['priceChange'] = priceChange
                            }

                            storage[rule]['transactions'].push(obj)

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
                console.log('Rule', rule)
                const transactions = storage[rule]['transactions']
                if (transactions.length < 1) continue
                const exits = transactions.filter((item: orderObject) => item['type'].includes('Exit'))

                const profit = exits.reduce((acc, item) => acc + item['netProfit']!, 0)
                const feeTotal = exits.reduce((acc, item) => acc + item['feeSum']!, 0)
                const ratio = exits.filter((item) => item['netProfit']! > 0).length / exits.length
                let profitPercentage = 1
                
                const profits = exits.map((item: orderObject) => item['netProfitPercentage']!)
                for (const percent of profits) {
                    profitPercentage *= 1 + (percent / 100)
                }
                profitPercentage = (profitPercentage - 1) * 100

                tables[`${transactions[0]['symbol'].replace('-PERP', '')} ${rule}`] = {
                    'Net Profit': profit.toFixed(2) + '$',
                    'Profit Percentage': profitPercentage.toFixed(2) + '%',
                    'Fee Total': feeTotal.toFixed(2) + '$',
                    'Transactions': transactions.length,
                    'Win Ratio': (ratio * 100).toFixed(0) + '%',
                    'Invested': (transactions[0]['invest'] / leverage).toFixed(0) + '$',
                }
            }
        }
    }
})()


async function checkIfTriggered(array: boolean[]) {
    if (array.length === array.filter((item) => item).length) return true
    else return false
}