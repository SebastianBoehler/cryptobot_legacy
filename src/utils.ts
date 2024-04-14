import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com.',
  port: 465,
  secure: true,
  auth: {
    user: 'admin@sebastian-boehler.com',
    pass: 'pqfu kbyz ihln uaia',
  },
})

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const createChunks = <T>(array: T[], chunkSize: number): T[][] => {
  const chunks = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

const levels = {
  error: 0,
  warn: 1,
  notice: 2,
  http: 3,
  info: 4,
  debug: 5,
  silly: 6,
}

let logLevel = 'info'
console.log('Log level:', logLevel)

export const logger = {
  info: (...params: any) => log('INFO', ...params),
  error: (...params: any) => log('ERROR', ...params),
  warn: (...params: any) => log('WARN', ...params),
  http: (...params: any) => log('HTTP', ...params),
  debug: (...params: any) => log('DEBUG', ...params),
  silly: (...params: any) => log('SILLY', ...params),
  notice: (...params: any) => log('NOTICE', ...params),
  warning: (...params: any) => log('WARNING', ...params),
}

export const changeLogLevel = (level: string) => {
  // @ts-ignore
  if (levels[level] === undefined) {
    logger.error('Invalid log level:', level)
    return
  }
  logLevel = level
  console.log('Change Log level:', logLevel)
}

const log = (level: string, ...params: any) => {
  // @ts-ignore
  if (levels[level.toLowerCase()] > levels[logLevel]) return
  console.log(`[${level}](${new Date().toLocaleTimeString()})`, ...params)
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

export const sendMail = async (text: string, subject: string = 'Cryptobot') => {
  try {
    await transporter.sendMail({
      from: 'admin@sebastian-boehler.com',
      to: 'basti.boehler@hotmail.de',
      subject,
      html: `
            <div style="padding=25px"> 
                <h1>${subject}</h1>
                <p>${text}</p>
            </div>
        `,
    })
  } catch (error) {
    logger.error('Error sending mail', error)
  }
}
