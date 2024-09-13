const fetch = require('node-fetch')

const getCompanyData = async (cik) => {
  const formattedCik = String(cik).padStart(10, '0');
  const latestFilingsUrl = `https://data.sec.gov/submissions/CIK${formattedCik}.json`
  console.log(`Fetching company data from: ${latestFilingsUrl}`)
  const response = await fetch(latestFilingsUrl, {
    headers: {
      'User-Agent': 'HB Capital contact@hb-capital.app',
      'accept-encoding': 'gzip, deflate',
      accept: 'application/json',
      //host: 'www.sec.gov'
    }
  })
  console.log(`Company data fetch status: ${response.status}`)
  return await response.json()
}

const getReports = async (
  cik,
  after = new Date('2024-01-01'),
  forms = ['10-Q', '10-K', '8-K']
) => {
  const formattedCik = String(cik).padStart(10, '0');
  const latestFilings = await getCompanyData(formattedCik)
  const { recent } = latestFilings.filings

  const mapped = recent.form.map((form, index) => {
    return {
      form,
      cik: formattedCik, // Pass the formatted CIK here
      primaryDocument: recent.primaryDocument[index],
      filingDate: new Date(recent.filingDate[index]),
      accessionNumber: recent.accessionNumber[index],
      isXBRL: recent.isXBRL[index],
      act: recent.act[index],
      primaryDocDescription: recent.primaryDocDescription[index],
    }
  })

  const reportAccessions = mapped.filter((filing) => forms.includes(filing.form) && filing.filingDate > after)

  console.log(`Found ${reportAccessions.length} report accessions`)
  const reports = await Promise.all(
    reportAccessions.map(async (filing) => {
      const filingUrl = `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${filing.accessionNumber.split('-').join('')}/${filing.primaryDocument
        }`
      console.log(`Fetching report from: ${filingUrl}`)
      const response = await fetch(filingUrl, {
        headers: {
          'User-Agent': 'HB Capital contact@hb-capital.app',
          'accept-encoding': 'gzip, deflate',
          accept: 'application/json',
          host: 'www.sec.gov'
        },
      })
      console.log(`Report fetch status: ${response.status}`)
      const filingContent = await response.text()
      return {
        content: filingContent,
        ...filing,
      }
    })
  )

  return reports
}

exports.main = async (args) => {
  const { cik } = args
  const ipResponse = await fetch('https://api.ipify.org?format=json').then(res => res.json());
  console.log(`Request IP: ${ipResponse.ip}`);
  if (!cik) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'CIK is required' }),
    }
  }

  try {
    console.log(`Loading reports for CIK: ${cik}`)
    const reports = await getReports(cik)
    return {
      statusCode: 200,
      body: JSON.stringify(reports),
    }
  } catch (error) {
    console.error(error)
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Error loading reports' }),
    }
  }
}
