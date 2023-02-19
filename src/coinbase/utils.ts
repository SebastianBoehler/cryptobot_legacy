import crypto from 'crypto'
import { ProductsResponse } from './types';

class CoinbaseAdvanced {
    key: string;
    baseURL: string = 'https://api.coinbase.com/api/v3';

    constructor(key: string) {
        this.key = key;
    }

    createSignature(data: string) {
        const secret = 'WlXvIjcHa6yqenEfJfVRYTsLbmGKdgog'
        return crypto.createHmac('sha256', secret).update(data).digest('hex');
    }

    createHeaders(timestamp: number, method: string, path: string, body: string) {
        return {
            accept: 'application/json',
            'CB-ACCESS-KEY': this.key,
            'CB-ACCESS-SIGN': this.createSignature(timestamp + method + path + body),
            'CB-ACCESS-TIMESTAMP': timestamp.toString(),
        }
    }

    async listProducts() {
        const resp = await fetch(`${this.baseURL}/brokerage/products`, {
            method: 'GET',
            headers: this.createHeaders(Math.floor(Date.now() / 1000), 'GET', '/api/v3/brokerage/products', ''),
        });
        //console.log('status', resp.status)
        const data: ProductsResponse = await resp.json();

        return data.products
    }

    async getKlines({ symbol, interval, startTime, endTime }: { symbol: string, interval: string, startTime: number, endTime: number }) {
        const resp = await fetch(`${this.baseURL}/brokerage/products/${symbol}/candles?granularity=${interval}&start=${startTime}&end=${endTime}`, {
            method: 'GET',
            headers: this.createHeaders(Math.floor(Date.now() / 1000), 'GET', `/api/v3/brokerage/products/${symbol}/candles`, ''),
        });
        //console.log('status', resp.status)
        const data: {
            candles: {
                start: string,
                open: string,
                high: string,
                low: string,
                close: string,
                volume: string,
            }[]
        } = await resp.json();

        return data.candles
    }
}

export {
    CoinbaseAdvanced,
}

export const timeKey = 'start'