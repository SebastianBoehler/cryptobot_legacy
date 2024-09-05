const fetch = require('node-fetch')

const getCompanyData = async (cik) => {
  const formattedCik = String(cik).padStart(10, '0');
  const latestFilingsUrl = `https://data.sec.gov/submissions/CIK${formattedCik}.json`
  console.log(`Fetching company data from: ${latestFilingsUrl}`)
  const response = await fetch(latestFilingsUrl, {
    headers: {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'accept-language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
      'cache-control': 'max-age=0',
      'priority': 'u=0, i',
      'sec-ch-ua': '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.1 Safari/537.36',
      'Content-Type': 'application/json',
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
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'accept-language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
          'cache-control': 'max-age=0',
          'priority': 'u=0, i',
          'sec-ch-ua': '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'none',
          'sec-fetch-user': '?1',
          'upgrade-insecure-requests': '1',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.1 Safari/537.36',
          'Content-Type': 'application/json',
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
