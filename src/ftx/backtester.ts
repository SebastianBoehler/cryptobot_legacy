import { generateIndicators } from '../generateIndicators';
import mysql from '../mysql';
import { Market } from '../types/ftx';
import { OrderTypes, Rule } from '../types/trading';
import { calculateProfit, getMarkets } from './utils';

const mysqlClient = new mysql('ftx');

//variables
const startTime = new Date();
startTime.setDate(startTime.getDate() - 14);
const rulesToTest = ['test']
let invest = 500
const leverage = +(process.env.LEVERAGE || 5);

(async () => {
    const allMarkets = await getMarkets()
    const markets = allMarkets.filter((item: Market) => item['futureType'] === 'perpetual').sort(function (a: Market, b: Market) { return b['volumeUsd24h'] - a['volumeUsd24h']})
    const symbols = [...new Set(markets.map((item: Market) => item['name']))]

    //for every symbol
    for (const symbol of symbols) {
        console.info(`Backtesting ${symbol}`)
        const history = await mysqlClient.getPriceHistory(symbol, `WHERE time >= ${startTime.getTime()}`)

        const storage: {
            [key: string]: {
                transactions: any[]
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
            console.log(`${new Date(timestamp).toLocaleString()} | Testing ${symbol} ${storage['test']?.transactions.length}`)

            const [indicators5min, indicators25min, indicators90min] = await Promise.all([
                generateIndicators(symbol, 5, timestamp),
                generateIndicators(symbol, 25, timestamp),
                generateIndicators(symbol, 90, timestamp),
            ])

            if (indicators5min && indicators25min && indicators90min) console.log()

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
                            netProfitPercentage > 0.5 || netProfitPercentage < -1
                       ]],
                       'Short Entry': [[false]],
                       'Short Exit': [[false]]
                    }
                }

                //there is an entry
                const hasOpenPosition = latestTransaction && latestTransaction['type'].includes('Entry')

                if (hasOpenPosition) {
                    console.log(`${rule} profit: ${netProfit?.toFixed(2)}$ | ${netProfitPercentage.toFixed(2)}% ${priceChange!.toFixed(2)}% | Trxs: ${transactions.length} | Wallet: ${latestTransaction['invest']}`)

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
                            if (latestTransaction) invest = exitInvestSize
                            else invest = invest * leverage
                            //execute order
                            const feeDecimal = process.env.FTX_FEE || 0.000665
                            if (!fee) fee = invest * +feeDecimal

                            let obj: any = {
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
        }
        break
    }
})()


async function checkIfTriggered(array: boolean[]) {
    if (array.length === array.filter((item) => item).length) return true
    else return false
}