import mysql from './mysql';
import {
    ADL,
    ADX,
    BollingerBands,
    EMA, MACD, RSI, StochasticRSI
} from 'technicalindicators';

const mysqlClient = new mysql('ftx');

async function generateIndicators(symbol: string, granularity: number, timestamp: number = new Date().getTime()) {
    const repaintNo = await stopRepainting(timestamp, granularity)
    const repaintDate = new Date(timestamp)
    const limit = (55 * granularity) + (granularity) * 35 * 5
    repaintDate.setMinutes(repaintDate.getMinutes() - repaintNo)
    repaintDate.setSeconds(0)
    //console.log(granularity, new Date(timestamp).toLocaleTimeString(), repaintNo, repaintDate.toLocaleTimeString())

    let history = await mysqlClient.getPriceHistory(symbol, `WHERE time <= ${repaintDate.getTime()}`, limit)

    //console.log('repaint', repaintDate.toLocaleString(), repaintDate.toLocaleTimeString(), granularity)

    let pointInTime = repaintDate.getTime()

    const transformedHistory = granularity === 1 ? history : []

    while (pointInTime >= history[0]['time'] && granularity > 1) {
        const temp = history.filter(item => item['time'] >= pointInTime && item['time'] < (pointInTime + (granularity * 60 * 1000)))
        //console.log('temp',temp.length, new Date(temp[0]['time']).toLocaleString(), new Date(temp[temp.length - 1]['time']).toLocaleString())
        if (temp.length < granularity * 0.6) {
            //console.log('break', new Date(pointInTime).toLocaleString(), new Date(pointInTime - (granularity * 60 * 1000)).toLocaleString())
            //console.log(pointInTime, pointInTime - (granularity * 60 * 1000))
            pointInTime -= (granularity * 60 * 1000)
            continue
        }

        transformedHistory.push({
            time: pointInTime,
            open: temp[0]['open'],
            high: Math.max(...temp.map(item => item['high'])),
            low: Math.min(...temp.map(item => item['low'])),
            close: temp[temp.length - 1]['close'],
            price: temp[temp.length - 1]['close'],
            volume: temp.reduce((acc, item) => acc + item['volume'], 0)
        })
        //console.log(new Date(pointInTime).toLocaleString(), new Date(pointInTime - (granularity * 60 * 1000)).toLocaleString(), temp.length,)
        //console.log(new Date(temp[0]['time']).toLocaleString(), new Date(temp[temp.length - 1]['time']).toLocaleString())
        pointInTime -= (granularity * 60 * 1000)
    }

    transformedHistory.reverse()
    //console.log(new Date(transformedHistory[transformedHistory.length - 1]['time']).toLocaleString(), transformedHistory[transformedHistory.length - 1])

    const closes = transformedHistory.map((item) => item['close'])
    const highs = transformedHistory.map((item) => item['high'])
    const lows = transformedHistory.map((item) => item['low'])
    const opens = transformedHistory.map((item) => item['open'])
    const volumes = transformedHistory.map((item) => item['volume'])

    if (closes.length < 50) throw {
        message: 'Not enough data to generate indicators',
        symbol,
        granularity,
        limit
    }

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

    const stochrsi = StochasticRSI.calculate({
        values: closes,
        kPeriod: 3,
        dPeriod: 3,
        rsiPeriod: 14,
        stochasticPeriod: 14,
    })

    const bollinger = BollingerBands.calculate({
        values: closes,
        period: 14,
        stdDev: 2
    })

    const adl = ADL.calculate({
        high: highs,
        low: lows,
        close: closes,
        volume: volumes
    })

    const adx = ADX.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: 14
    })

    return {
        EMA_8: EMA_8[EMA_8.length - 1],
        EMA_13: EMA_13[EMA_13.length - 1],
        EMA_21: EMA_21[EMA_21.length - 1],
        EMA_55: EMA_55[EMA_55.length - 1],
        MACD: macd[macd.length - 1],
        MACD_prev: macd[macd.length - 2],
        RSI: rsi[rsi.length - 1],
        STOCH_RSI: stochrsi[stochrsi.length - 1],
        close: closes[closes.length - 1],
        open: opens[opens.length - 1],
        high: highs[highs.length - 1],
        low: lows[lows.length - 1],
        volume: volumes[volumes.length - 1],
        bollingerBands: bollinger[bollinger.length - 1],
        ADL: adl[adl.length - 1],
        ADX: adx[adx.length - 1],
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