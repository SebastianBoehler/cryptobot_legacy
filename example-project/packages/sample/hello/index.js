const fetch = require('node-fetch');

async function main(args) {
  let name = args.name || 'stranger';
  let greeting = 'Hello ' + name + '!';
  console.log(greeting);

  // Create dummy cookies
  const cookies = [
    'auth_hash=asd234gdiu',
    'dummy_cookie2=value2',
    // Add more cookies as needed
  ];

  // Construct the cookie string
  const cookieString = cookies.join('; ');

  const resp = await fetch("https://www.sec.gov/files/company_tickers_exchange.json", {
    "headers": {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "accept-language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
      "cache-control": "max-age=0",
      //"if-modified-since": "Wed, 21 Aug 2024 20:39:59 GMT",
      "priority": "u=0, i",
      "sec-ch-ua": "\"Not)A;Brand\";v=\"99\", \"Google Chrome\";v=\"127\", \"Chromium\";v=\"127\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"macOS\"",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "sec-fetch-user": "?1",
      "upgrade-insecure-requests": "1",
      "Cookie": cookieString, // Add the cookie string to the headers,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.1 Safari/537.36'
    },
    "referrerPolicy": "strict-origin-when-cross-origin",
    "body": null,
    "method": "GET",
    "mode": "cors",
    "credentials": "include"
  });

  console.log(resp.status);
  const json = await resp.json();

  //TODO: log my IP adress to see if it changes every startup
  console.log(await fetch('https://api.ipify.org?format=json').then(res => res.json()));

  return { "body": json };
}

exports.main = main;
