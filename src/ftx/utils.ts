import {
    RestClient,
} from 'ftx-api'
import { HistoricalPrice, Market } from '../types/ftx';
import { orderObject } from '../types/trading';

const FTXClient = new RestClient(process.env.FTX_KEY, process.env.FTX_SECRET);

async function getMarkets() {
    const respMarkets: {
        result: Market[],
        success: boolean,
    } = await FTXClient.getMarkets();

    if (respMarkets['success']) return respMarkets['result']
    else return []
}

async function getHistoricalPrices(symbol: string, start_time: number) {
    const respHistorical: {
        result: HistoricalPrice[],
        success: boolean,
    } = await FTXClient.getHistoricalPrices({
        market_name: symbol,
        resolution: 60,
        start_time
    })

    if (respHistorical['success']) return respHistorical['result']
    else return []
}

async function calculateProfit(entry: orderObject | any, price: number, exit?: any) {
    const feeDecimal = +(process.env.FTX_FEE || 0.000665)
    if (!entry) return {
        netProfit: 0,
        netProfitPercentage: 0,
        //exitInvestSize: 0,
        netInvest: 0
    }
    const type = entry['type']
    if (type.includes('Exit')) return {
        netProfit: 0,
        netProfitPercentage: 0,
        //exitInvestSize: entry['invest'],
        netInvest: entry['netInvest']
    }
    
    const leverage = +(process.env.LEVERAGE || 5)
    const isLongOrder = type.includes('Long')
    const InvestSizeBrutto = isLongOrder ? entry['invest'] * (price / entry['price']) : entry['invest'] * (2 - price / entry['price'])
    const bruttoProfit = InvestSizeBrutto - entry['invest']
    const fee = InvestSizeBrutto * feeDecimal
    const priceChange = (price / entry['price'] - 1) * 100

    console.log(InvestSizeBrutto, bruttoProfit)

    const netProfit = bruttoProfit - (entry['fee'] + fee)
    const netProfitPercentage = netProfit / (entry['invest'] / leverage) * 100
    const netInvest = entry['netInvest'] + netProfit

    console.log(entry['fee'], fee)

    return {
        fee,
        feeSum: entry['fee'] + fee,
        bruttoProfit,
        netProfit,
        priceChange,
        netProfitPercentage,
        netInvest
    }
}

export {
    getMarkets,
    getHistoricalPrices,
    calculateProfit
}