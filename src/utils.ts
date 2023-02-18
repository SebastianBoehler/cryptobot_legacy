export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createChunks = <T>(array: T[], chunkSize: number): T[][] => {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

export const logger = {
    info: (message: any, ...data: any) => console.log(`[INFO](${new Date().toLocaleTimeString()})`, message, ...data),
    error: (message: any, ...data: any) => console.error(`[ERROR](${new Date().toLocaleTimeString()})`, message, ...data),
    warn: (message: any, ...data: any) => console.warn(`[WARN](${new Date().toLocaleTimeString()})`, message, ...data),
    http: (message: any, ...data: any) => console.log(`[HTTP](${new Date().toLocaleTimeString()})`, message, ...data),
}