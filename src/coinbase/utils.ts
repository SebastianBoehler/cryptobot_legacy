//import crypto from 'crypto'
import CryptoJS from 'crypto-js'

class Coinbase {
    private key: string;
    private baseURL: string = 'https://api.coinbase.com/api/v3';

    constructor(key: string) {
        this.key = key;
    }

    createSignature(timestamp: number, method: string, path: string, body: string) {
        const secret = 'WlXvIjcHa6yqenEfJfVRYTsLbmGKdgog'
        const what = timestamp + method + path + body;
        
        const hash = CryptoJS.HmacSHA256(what, secret).toString()
        return hash
    }

    createHeaders(timestamp: number, method: string, path: string, body: string) {
        return {
            accept: 'application/json',
            'CB-ACCESS-KEY': this.key,
            'CB-ACCESS-SIGN': this.createSignature(timestamp, method, path, body),
            'CB-ACCESS-TIMESTAMP': timestamp.toString(),
        }
    }

    async listProducts() {
        const resp = await fetch(`${this.baseURL}/brokerage/products`, {
            method: 'GET',
            headers: this.createHeaders(Math.floor(Date.now() / 1000), 'GET', '/api/v3/brokerage/products', ''),
        });
        console.log('status', resp.status)
        const data = await resp.json();

        return data
    }
}

export default Coinbase