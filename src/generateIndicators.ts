import mysql from './mysql';
import {
    EMA, MACD, RSI
} from 'technicalindicators';

const mysqlClient = new mysql('ftx');

async function generateIndicators(symbol: string, granularity: number, timestamp: number = new Date().getTime()) {
    const repaintNo = await stopRepainting(timestamp, granularity)
    const repaintDate = new Date(timestamp)
    const limit = (55 * granularity) + (granularity) * 100 * 5
    repaintDate.setMinutes(repaintDate.getMinutes() - repaintNo)
    repaintDate.setSeconds(0)
    //console.log(granularity, new Date(timestamp).toLocaleTimeString(), repaintNo, repaintDate.toLocaleTimeString())

    let history = await mysqlClient.getPriceHistory(symbol, `WHERE time <= ${repaintDate.getTime()}`, limit)
    
    if (granularity > 1) history = history.filter((item, index) => {
        const temp = history.slice(index - granularity - 1, index - 1)

        if (temp.length > 0 && index % granularity == 0) {
            //console.log(granularity, temp.length, new Date(temp[temp.length - 1]['time']).toLocaleTimeString())
            return {
               time: temp[temp.length - 1]['time'],
               open: temp[0]['open'],
              close: temp[temp.length - 1]['close'],
              high: Math.max(...temp.map((item) => item['high'])),
              low: Math.min(...temp.map((item) => item['low'])),
              volume: temp.map((item) => item['volume']).reduce((a,b) => a + b, 0)
            }
        }
        else return undefined
    })

    //console.log(history.length)
    const closes = history.map((item) => item['close'])
    //const highs = history.map((item) => item['high'])
    //const lows = history.map((item) => item['low'])

    const EMA_8 = EMA.calculate({
        values: closes,
        period: 8
    })

    const EMA_13 = EMA.calculate({
        values: closes,
        period: 13
    })

    const EMA_21 = EMA.calculate({
        values: closes,
        period: 21
    })

    const EMA_55 = EMA.calculate({
        values: closes,
        period: 55
    })

    const macd = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: true,
        SimpleMASignal: true
    })

    const rsi = RSI.calculate({
        values: closes,
        period: 14
    })

    return {
        EMA_8: EMA_8[EMA_8.length - 1],
        EMA_13: EMA_13[EMA_13.length - 1],
        EMA_21: EMA_21[EMA_21.length - 1],
        EMA_55: EMA_55[EMA_55.length - 1],
        MACD: macd[macd.length - 1],
        MACD_prev: macd[macd.length - 2],
        RSI: rsi[rsi.length - 1]
    }
}

async function stopRepainting(timestamp: number, granularity: number) {
    let mins = Math.trunc(timestamp / 1000 / 60)
    if (mins % granularity == 0) {
        return 0
    } else {
        for (var b = 1; b <= granularity; b++) {
            if ((mins - b) % granularity == 0) {
                return b
            }
        }
    }
    return 0
}

export {
    generateIndicators
}