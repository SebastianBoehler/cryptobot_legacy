export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const createChunks = <T>(array: T[], chunkSize: number): T[][] => {
  const chunks = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

export const logger = {
  info: (...params: any) => console.log(`[INFO](${new Date().toLocaleTimeString()})`, ...params),
  error: (...params: any) => console.error(`[ERROR](${new Date().toLocaleTimeString()})`, ...params),
  warn: (...params: any) => console.warn(`[WARN](${new Date().toLocaleTimeString()})`, ...params),
  http: (...params: any) => console.log(`[HTTP](${new Date().toLocaleTimeString()})`, ...params),
  debug: (...params: any) => console.log(`[DEBUG](${new Date().toLocaleTimeString()})`, ...params),
  silly: (...params: any) => console.log(`[SILLY](${new Date().toLocaleTimeString()})`, ...params),
  notice: (...params: any) => console.log(`[NOTICE](${new Date().toLocaleTimeString()})`, ...params),
  warning: (...params: any) => console.log(`[WARNING](${new Date().toLocaleTimeString()})`, ...params),
  //silly: (...params: any) =>
  //console.log(`[SILLY](${new Date().toLocaleTimeString()})`, ...params),
}

export function createUniqueId(length: number) {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let result = ''
  for (let i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}

export function toDecimals(value: number, decimals: number) {
  const arr = Number(value)
    .toString()
    .match(new RegExp('^-?\\d+(?:.\\d{0,' + decimals + '})?'))!
  return +arr[0]
}
