class Binance {
    baseURL: string = 'https://api.binance.com/api/v3';
    apiKey: string;
    apiSecret: string;

    constructor(key: string, secret: string) {
        this.apiKey = key;
        this.apiSecret = secret;
    }

    async exchangeInfo(permissions?: string[]) {
        const resp = await fetch(`${this.baseURL}/exchangeInfo${permissions ? `?permissions=${permissions.toString()}` : ''}`, {
            method: 'GET',
        });
        const data = await resp.json();
        return data;
    }
}

export default Binance

export const timeKey = 'openTime'