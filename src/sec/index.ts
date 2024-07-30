import { GenerateContentRequest, VertexAI } from '@google-cloud/vertexai'
import { cikLookup, getCompanyData, getQuarterlyReports } from './utils'
import MongoWrapper from '../mongodb'
import { geminiWikiQueryFunc } from '../chat/tools'

const vertexAI = new VertexAI({
  project: 'desktopassistant-423912',
  location: 'us-central1',
  // googleAuthOptions: {
  //   keyFilename: './src/chat/service_account.json',
  // },
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

const tools = [
  {
    functionDeclarations: [
      //geminiVectorSearchFunc,
      geminiWikiQueryFunc,
    ],
  },
]

const loadCompanyData = async (ticker: string) => {
  const CIK = await cikLookup(ticker)
  if (!CIK) return
  const [companyData, quarterlyReports] = await Promise.all([getCompanyData(CIK), getQuarterlyReports(CIK)])

  for (const report of quarterlyReports) {
    const request: GenerateContentRequest = {
      tools,
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
      // @ts-ignore
      toolConfig: {
        function_calling_config: {
          mode: 'ANY', //AUTO, ANY, NONE - force function calling
          //allowed_function_names: ['name']
        },
      },
      systemInstruction: `You are an helpful AI assistant and export in analyzing financial statements and stock market data.
      Explain the changes and with that how they specifically impact the market and the stock price of the company.
      DO NOT reply in markdown`,
    }

    const { response } = await generativeModel.generateContent(request)
    report.summarization = response.candidates?.[0].content.parts[0].text
  }

  delete companyData.filings

  const promises = []
  const time = new Date()
  for (const report of quarterlyReports) {
    report.time = time
    promises.push(mongo.updateUpsert(report, 'accessionNumber', 'reports', 'sec_data'))
  }
  companyData.cik = CIK
  companyData.time = time
  promises.push(mongo.updateUpsert(companyData, 'cik', 'companies', 'sec_data'))

  await Promise.allSettled(promises)
}

export default loadCompanyData
