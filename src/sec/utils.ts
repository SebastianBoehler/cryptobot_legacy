const cikLookup = async (ticker: string) => {
  const response = await fetch('https://www.sec.gov/files/company_tickers_exchange.json', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
    },
  })
  console.log(response.status)
  const { data } = await response.json()

  const item = data.find((item: string[]) => item[2] === ticker)

  // Ensure the returned value is a string and always 10 characters long
  return item ? String(item[0]).padStart(10, '0') : null
}

const getCompanyData = async (cik: string) => {
  const latestFilingsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`
  const response = await fetch(latestFilingsUrl)
  const data = await response.json()

  return data
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
  //set of form types
  // const formTypes = new Set(mapped.map((filing: any) => filing.form))
  // console.log(formTypes)

  const reportAccessions = mapped.filter((filing: any) => forms.includes(filing.form) && filing.filingDate > after)

  const reports = await Promise.all(
    reportAccessions.map(async (filing: Record<string, any>) => {
      //https://www.sec.gov/Archives/edgar/data/320193/000032019319000076/a10-qq320196292019.htm
      const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${filing.accessionNumber.split('-').join('')}/${
        filing.primaryDocument
      }`
      console.log(filingUrl)
      const response = await fetch(filingUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        },
      })
      const filingContent = await response.text()
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
  const response = await fetch(companyFactsUrl)
  const data = await response.json()

  return data
}

export { cikLookup, getCompanyData, getReports, getCompanyFacts }
