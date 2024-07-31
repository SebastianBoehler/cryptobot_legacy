import { GenerateContentRequest, VertexAI } from '@google-cloud/vertexai'
import { cikLookup, getCompanyData, getReports } from './utils'
import MongoWrapper from '../mongodb'
import path from 'path'

const vertexAI = new VertexAI({
  project: 'desktopassistant-423912',
  location: 'us-central1',
  googleAuthOptions: {
    //'./src/chat/service_account.json',
    keyFilename: path.join(__dirname, '../chat/service_account.json'),
  },
})
const database = 'sec_data'
const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  generationConfig: {
    maxOutputTokens: 1024,
    temperature: 0.5,
  },
})
const mongo = new MongoWrapper(database)

const loadCompanyData = async (ticker: string) => {
  const CIK = await cikLookup(ticker)
  if (!CIK) return

  const latestReport = await mongo.getLatestEntry('sec_data', 'reports', 'filingDate', { cik: CIK })
  console.log('latestReport', latestReport?.filingDate)
  const latestReportDate = latestReport?.filingDate

  const [companyData, loadedReports] = await Promise.all([getCompanyData(CIK), getReports(CIK, latestReportDate)])

  for (const report of loadedReports) {
    const request: GenerateContentRequest = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'Summarize the in the report declared data and how it could impact the market, what kind of incluence these news would have.',
            },
            { text: report.content },
          ],
        },
      ],
      systemInstruction: `
        **You are a helpful AI assistant and expert in analyzing financial statements and stock market data.**

        **Instruction:**
        - **Analyze Changes:** Explain the changes in financial statements or stock market data.
        - **Impact Analysis:** Describe how these changes specifically impact the market and the stock price of the company.
        - **Sentiment Analysis:** Provide a sentiment analysis of the report single word (bullish, bearish, neutral).

        **Output Schema:**
        {
          "summary": "summary of the report in about 20 sentences max",
          "short": "2/3 sentence short summary of key findings of the report",
          "sentiment": "bullish/bearish/neutral",
        }
      `,
      generationConfig: {
        responseMimeType: 'application/json',
      },
    }

    const { response } = await generativeModel.generateContent(request)
    const text = response.candidates?.[0].content.parts[0].text
    if (!text) continue
    const json = JSON.parse(text)
    report.summary = json.summary
    report.short = json.short
    report.sentiment = json.sentiment
  }

  delete companyData.filings

  const promises = []
  const time = new Date()
  for (const report of loadedReports) {
    report.time = time
    promises.push(mongo.updateUpsert(report, 'accessionNumber', 'reports', 'sec_data'))
  }
  companyData.cik = CIK
  companyData.time = time
  promises.push(mongo.updateUpsert(companyData, 'cik', 'companies', 'sec_data'))

  await Promise.allSettled(promises)
}

export default loadCompanyData
