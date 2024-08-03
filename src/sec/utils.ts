import axios from 'axios'

const randomUserAgent = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko',
  'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0; yie8)',
  'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:102.0) Gecko/20100101 Firefox/102.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:102.0) Gecko/20100101 Firefox/102.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x86_64; rv:102.0) Gecko/20100101 Firefox/102.0',
  'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
]

const cikLookup = async (ticker: string) => {
  const rndmUrlParam = Math.random().toString(36).substring(7)
  const randomUserAgentIndex = Math.floor(Math.random() * randomUserAgent.length)
  const response = await axios.get(`https://www.sec.gov/files/company_tickers_exchange.json?time=${rndmUrlParam}`, {
    headers: {
      'User-Agent': randomUserAgent[randomUserAgentIndex],
      'Accept-Encoding': 'gzip, deflate',
      host: 'www.sec.gov',
    },
  })
  if (response.status !== 200) throw response.data
  const { data } = response.data

  const item = data.find((item: string[]) => item[2] === ticker)

  return item ? String(item[0]).padStart(10, '0') : null
}

const getCompanyData = async (cik: string) => {
  const latestFilingsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`
  const response = await axios.get(latestFilingsUrl)
  return response.data
}

const getReports = async (
  cik: string,
  after: Date = new Date('2024-01-01'),
  forms: string[] = ['10-Q', '10-K', '8-K']
) => {
  const latestFilings = await getCompanyData(cik)
  const { recent } = latestFilings.filings

  const mapped = recent.form.map((form: string, index: number) => {
    return {
      form,
      cik,
      primaryDocument: recent.primaryDocument[index],
      filingDate: new Date(recent.filingDate[index]),
      accessionNumber: recent.accessionNumber[index],
      isXBRL: recent.isXBRL[index],
      act: recent.act[index],
      primaryDocDescription: recent.primaryDocDescription[index],
    }
  })

  const reportAccessions = mapped.filter((filing: any) => forms.includes(filing.form) && filing.filingDate > after)

  const reports = await Promise.all(
    reportAccessions.map(async (filing: Record<string, any>) => {
      const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${filing.accessionNumber.split('-').join('')}/${
        filing.primaryDocument
      }`
      const response = await axios.get(filingUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        },
      })
      const filingContent = response.data
      return {
        content: filingContent,
        ...filing,
      }
    })
  )

  return reports
}

//https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
const getCompanyFacts = async (cik: string) => {
  const companyFactsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`
  const response = await axios.get(companyFactsUrl)
  return response.data
}

export { cikLookup, getCompanyData, getReports, getCompanyFacts }
