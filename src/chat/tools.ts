import { z } from 'zod'
import { PuppeteerWebBaseLoader } from '@langchain/community/document_loaders/web/puppeteer'
import { GoogleCloudStorageDocstore } from '@langchain/community/stores/doc/gcs'
import { MatchingEngine } from '@langchain/community/vectorstores/googlevertexai'
import { GoogleVertexAIEmbeddings } from '@langchain/community/embeddings/googlevertexai'
import { WikipediaQueryRun } from '@langchain/community/tools/wikipedia_query_run'
import { RecursiveUrlLoader } from '@langchain/community/document_loaders/web/recursive_url'
import { YoutubeLoader } from '@langchain/community/document_loaders/web/youtube'
import { GithubRepoLoader } from '@langchain/community/document_loaders/web/github'
import { compile } from 'html-to-text'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import nodemailer from 'nodemailer'
import { PythonInterpreterTool } from 'langchain/experimental/tools/pyinterpreter'
import { zodToGeminiParameters } from '@langchain/google-vertexai/utils'
import {
  FunctionCall,
  FunctionDeclaration,
  FunctionDeclarationSchema,
  FunctionResponsePart,
  GenerateContentRequest,
  VertexAI,
} from '@google-cloud/vertexai'
import fs from 'fs'
import { sleep } from 'openai/core'

const vertexAI = new VertexAI({
  project: 'desktopassistant-423912',
  location: 'us-central1',
  googleAuthOptions: {
    keyFilename: './src/chat/service_account.json',
  },
})

const model = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  // The following parameters are optional
})

//Vector search | grounding
const vectorSearchSchema = z.object({
  query: z.string().describe('The query to search the vector store for.'),
  k: z.number().describe('The number of results to return.'),
  filter: z.array(z.object({ namespace: z.string(), allowlist: z.array(z.string()) })).optional(),
})

export const geminiVectorSearchFunc: FunctionDeclaration = {
  name: 'vectorSearchTool',
  description: 'Can perform vector search across a vector store (knowledge base) filled with context relevant data.',
  parameters: zodToGeminiParameters(vectorSearchSchema) as unknown as FunctionDeclarationSchema,
}

const vectorSearch = async ({ query, k, filter }: Record<string, any>) => {
  const vertexEmbeddings = new GoogleVertexAIEmbeddings()
  //console.log(embeddings2);

  const store = new GoogleCloudStorageDocstore({
    bucket: 'vectorstore_bucket_34',
  })

  const config = {
    index: '1411724551552761856',
    indexEndpoint: '8030327153927127040',
    apiVersion: 'v1beta1',
    docstore: store,
  }

  console.log('vec search', query, k, filter)

  const engine = new MatchingEngine(vertexEmbeddings, config)
  const results = await engine.similaritySearchWithScore(query, k, filter)
  const filtered = results.filter((r) => r[1] > 0.4)

  return {
    name: 'vectorSearchTool',
    response: {
      result: filtered,
    },
  }
}

// vector store add documents
const vectorStoreAddSchema = z.object({
  document: z.string().describe('The documents to add to the vector store'),
  metadata: z.object({
    source: z.string().describe('The source of the document'),
    url: z.string().describe('The url of the document').optional(),
    language: z
      .string()
      .describe('The language of the document e.g. en, es, fr, python, typescript, html. Important for code snippets')
      .optional(),
    type: z.enum(['text', 'code', 'youtube', 'github', 'pdf']).describe('The type of the document'),
  }),
})

export const geminiVectorSearchAddFunc: FunctionDeclaration = {
  name: 'vectorSearchAddTool',
  description: `Add document to the vector store (knowledge base). 
    Store data and facts as context that may get relevant in the future, data, you want to ground your answers against.
    overlap is automatically added, and the document is auto chunked into chunks of 1000 characters.
    \n
    Example metadata:
    { "source": "wikipedia", "url": "https://en.wikipedia.org/wiki/Python_(programming_language)", "language": "en", "type": "text"}
    { "source": "youtube", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "language": "en", "type": "youtube"}
    { "source": "web", "url": "https://arxiv.org/pdf/2106.04561.pdf", "language": "en", "type": "pdf", "author: "Author Name}
    `,
  parameters: zodToGeminiParameters(vectorStoreAddSchema) as unknown as FunctionDeclarationSchema,
}

const vectorStoreAddFunc = async ({ document, metadata }: Record<string, any>) => {
  //const vertexEmbeddings = new GoogleVertexAIEmbeddings()

  const store = new GoogleCloudStorageDocstore({
    bucket: 'vectorstore_bucket_34',
  })

  //   const config = {
  //     index: '1411724551552761856',
  //     indexEndpoint: '8030327153927127040',
  //     apiVersion: 'v1beta1',
  //     docstore: store,
  //   }

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1_000,
    chunkOverlap: 120,
  })
  const docs = await textSplitter.createDocuments([document], [{ ...metadata, timestamp: new Date() }])

  console.log('vector store add', docs.length, metadata)

  //now create a record of random name as key and doc as value
  const data: Record<string, any> = {}
  for (const doc of docs) {
    const name = Math.random().toString(36).substring(2, 25) + '.json'
    data[name] = {
      pageContent: doc,
    }
  }

  await store.add(data)

  // const engine = new MatchingEngine(vertexEmbeddings, config);

  // await engine.addDocuments(docs);

  return {
    name: 'vectorSearchAddTool',
    response: {
      result: 'Documents added to the vector store',
    },
  }
}

//Wikipedia
const wikiQuerySchema = z.object({
  query: z.string().describe('The query to search wikipedia for.'),
})

export const geminiWikiQueryFunc: FunctionDeclaration = {
  name: 'wikipediaQueryTool',
  description: 'Search wikipedia by a query',
  parameters: zodToGeminiParameters(wikiQuerySchema) as unknown as FunctionDeclarationSchema,
}

const wikiQuery = async ({ query }: Record<string, any>) => {
  console.log('wiki', query)
  const tool = new WikipediaQueryRun({
    topKResults: 3,
    maxDocContentLength: 8000,
  })

  const res = await tool.invoke(query)
  return {
    name: 'wikiQueryTool',
    response: {
      result: res,
    },
  }
}

// Puppeteer
const pupQuerySchema = z.object({
  url: z.string().describe(`
    The url to load, returns the raw content of the page.

    A list of popular example site and queries, understand the query pattern so you can use it for your own queries:
    \n
    https://www.youtube.com/@googlecloudtech/videos
    https://www.statista.com/study/14528/mutual-funds-statista-dossier/
    https://www.statista.com/study/65164/plastic-waste-worldwide/
    https://arxiv.org/pdf/2301.04020
    https://getkoala.com/companies?facets[category.industry][]=Venture%20Capital%20%26%20Private%20Equity
    `),
})

export const geminiPupQueryFunc: FunctionDeclaration = {
  name: 'puppeteerQueryTool',
  description: 'Load a webpage from url',
  parameters: zodToGeminiParameters(pupQuerySchema) as unknown as FunctionDeclarationSchema,
}

const pupQuery = async ({ url }: Record<string, any>) => {
  console.log('puppeteer', url)
  const loader = new PuppeteerWebBaseLoader(url)

  const docs = await loader.load().catch((e) => {
    console.error(e)
    return e
  })

  return {
    name: 'puppeteerQueryTool',
    response: {
      result: docs,
    },
  }
}

// Puppeteer Screenshot
const pupScreenshotSchema = z.object({
  url: z.string().describe(`
    The url to load, returns the raw content of the page.

    A list of popular example site and queries, understand the query pattern so you can use it for your own queries:
    \n
    https://www.youtube.com/@googlecloudtech/videos
    https://www.statista.com/study/14528/mutual-funds-statista-dossier/
    https://www.statista.com/study/65164/plastic-waste-worldwide/
    https://arxiv.org/pdf/2301.04020
    https://getkoala.com/companies?facets[category.industry][]=Venture%20Capital%20%26%20Private%20Equity
    `),
})

export const geminiPupScreenshotFunc: FunctionDeclaration = {
  name: 'puppeteerScreenshotTool',
  description: 'take a screenshot of an webpage and load the screenshot',
  parameters: zodToGeminiParameters(pupScreenshotSchema) as unknown as FunctionDeclarationSchema,
}

const pupScreenshot = async ({ url }: Record<string, any>) => {
  //TODO: use puppeteer instead og langchain provider for more control
  console.log('puppeteer screenshot', url)
  const loader = new PuppeteerWebBaseLoader(url, {
    launchOptions: {
      headless: false,
    },
    gotoOptions: {
      waitUntil: 'domcontentloaded',
    },
    async evaluate(page, browser) {
      await page.waitForResponse(url)
      await page.waitForNavigation()

      await sleep(1000 * 10)

      const base64 = await page.screenshot({
        encoding: 'base64',
      })

      //TODO: upload into bucket

      //TODO: pass to gemini to return text description

      await browser.close()
      return base64
    },
  })

  const doc = await loader.screenshot().catch((e) => {
    console.error(e)
    return e
  })

  //docs[0].pageContent is images base64 encoded
  fs.writeFileSync('screenshot.png', doc.pageContent, 'base64')

  return {
    name: 'puppeteerQueryTool',
    response: {
      result: 'Screenshot saved to screenshot.png',
    },
  }
}

//YouTube
const ytSchema = z.object({
  url: z.string().describe('The youtube video url to load, always use this tool when provided a youtube video url'),
})

export const geminiYoutubeQueryFunc: FunctionDeclaration = {
  name: 'youtubeVideoTool',
  description: 'Load a youtube video from url',
  parameters: zodToGeminiParameters(ytSchema) as unknown as FunctionDeclarationSchema,
}

const youtubeQuery = async ({ url }: Record<string, any>) => {
  console.log('youtube', url)
  const loader = YoutubeLoader.createFromUrl(url, {
    //language: "en",
    addVideoInfo: true,
  })

  const docs = await loader.load()
  return {
    name: 'youtubeVideoTool',
    response: {
      result: docs,
    },
  }
}

//Github
const githubSchema = z.object({
  url: z.string().describe('The github repository to laod'),
  branch: z.string().describe('The branch to load').optional(),
})

export const geminiGithubQueryFunc: FunctionDeclaration = {
  name: 'githubQueryTool',
  description: 'Load a github repository from url',
  parameters: zodToGeminiParameters(githubSchema) as unknown as FunctionDeclarationSchema,
}

const githubQuery = async ({ url, branch }: Record<string, any>) => {
  console.log('github', url, branch)

  const loader = new GithubRepoLoader(url, {
    branch: branch || 'master',
    recursive: true,
    unknown: 'warn',
    maxConcurrency: 5, // Defaults to 2
  })
  const docs = await loader.load().catch((e) => {
    console.error(e)
    return [{ pageCotent: `Failed to load ${url} from github, error: ${e}` }]
  })
  return {
    name: 'githubQueryTool',
    response: {
      result: docs,
    },
  }
}

//Recursive URL loader

const recursiveUrlSchema = z.object({
  url: z.string().describe('The url to load'),
  maxAmount: z.number().describe('The max amount of urls to load, defaults to 20').optional(),
})

export const geminiRecursiveUrlFunc: FunctionDeclaration = {
  name: 'recursiveUrlTool',
  description: `
    Load a webpage and its subpages recursively, use this tool to aggregate links from search result pages.
    ** Example urls for search queries: \n
    - https://www.statista.com/search/?q=cryptocurrency+trading&q=&Search=&p=1&tabGroup=report&sortMethod=publicationDate&interval=1%2C2024%2C2023%2C2022%2C2021%2C2&isoregion=1
    - https://arxiv.org/search/advanced?advanced=&terms-0-operator=AND&terms-0-term=quant+trading&terms-0-field=all&classification-physics_archives=all&classification-q_finance=y&classification-include_cross_list=include&date-filter_by=past_12&date-year=&date-from_date=&date-to_date=&date-date_type=submitted_date&abstracts=show&size=50&order=-announced_date_first
    - https://arxiv.org/list/stat/recent
    - https://www.youtube.com/results?search_query=finance+news
    - https://arxiv.org/search/?query=quant+trading&searchtype=all&source=header
    - https://arxiv.org/search/?query=deep+learning&searchtype=title&abstracts=show&order=-announced_date_first&size=50
    - https://www.google.com/search?q=global+money+supply+estimate
    - https://fred.stlouisfed.org/searchresults/?st=rates
    - https://fred.stlouisfed.org/searchresults/?st=rates&t=housing%3Bquarterly%3Bmei&ob=sr&od=desc
    - https://research.stlouisfed.org/ssi/search.php?q=fintech&partialfields=year:2021
    - https://www.nature.com/search?q=nutrition+muscle+growth&order=relevance
    `,
  parameters: zodToGeminiParameters(recursiveUrlSchema) as unknown as FunctionDeclarationSchema,
}

const recursiveUrlLoader = async ({ url, maxAmount }: Record<string, any>) => {
  console.log('recursive url', url)
  const compiledConvert = compile({ wordwrap: 120 }) // returns (text: string) => string;

  const loader = new RecursiveUrlLoader(url, {
    extractor: compiledConvert,
    maxDepth: 1,
    //excludeDirs: ["/docs/api/"],
  })

  const docs = await loader.load()
  //console.log(docs.length);
  return {
    name: 'recursiveUrlTool',
    response: {
      result: docs.slice(0, maxAmount || 20),
    },
  }
}

//Send Email tool
const emailSchema = z.object({
  to: z.string().email().describe("The recipient's email address"),
  subject: z.string().describe('The email subject'),
  html: z.string().describe('The email body as plain html code.'),
})

export const geminiEmailFunc: FunctionDeclaration = {
  name: 'sendEmailTool',
  description: 'Send an email to a recipient',
  parameters: zodToGeminiParameters(emailSchema) as unknown as FunctionDeclarationSchema,
}

const sendEmail = async ({ to, subject, html }: Record<string, any>) => {
  console.log('email', to, subject)

  // Create a reusable transporter object using the default SMTP transport
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'admin@sebastian-boehler.com', // Your Gmail address
      pass: 'pqfu kbyz ihln uaia', // Your Gmail password
    },
  })

  // Send mail with defined transport object
  let info = await transporter.sendMail({
    from: 'admin@sebastian-boehler.com', // Sender address
    to: to, // List of receivers
    subject: subject, // Subject line
    //text: text, // Plain text body
    html, // HTML body
  })

  console.log('Message sent')
  return {
    name: 'emailTool',
    response: {
      result: info,
    },
  }
}

// Define the schema for the HTTP request tool
const requestSchema = z.object({
  url: z.string().url().describe('The URL of the API'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).describe('The HTTP method'),
  headers: z.record(z.string()).optional().describe('The HTTP headers'),
  //data: z.record(z.unknown()).optional().describe("The HTTP body"),
})

export const geminiRequestFunc: FunctionDeclaration = {
  name: 'requestTool',
  description: 'Send an HTTP request to an API',
  parameters: zodToGeminiParameters(requestSchema) as unknown as FunctionDeclarationSchema,
}

const request = async ({ url, method, headers }: Record<string, any>) => {
  console.log('request', url, method, headers)

  let data

  try {
    const response = await fetch(url, {
      method,
      headers,
    })
    data = await response.json()
  } catch (error) {
    console.error(error)
    data = { error: error }
  }

  return {
    name: 'requestTool',
    response: {
      result: data,
    },
  }
}

//Python executer tool
const pythonSchema = z.object({
  code: z.string().describe('The python code to execute'),
})

export const geminiPythonFunc: FunctionDeclaration = {
  name: 'pythonTool',
  description: 'Execute python code using pyodide and return the result',
  parameters: zodToGeminiParameters(pythonSchema) as unknown as FunctionDeclarationSchema,
}

const executePython = async ({ code }: Record<string, any>) => {
  console.log('python', code)

  const interpreter = await PythonInterpreterTool.initialize({
    // @ts-ignore
    indexURL: './node_modules/pyodide',
  })

  let result
  let error
  try {
    result = await interpreter.invoke(code)
  } catch (e) {
    error = e
  }

  console.log(result)

  return {
    name: 'pythonTool',
    response: {
      result,
      error,
    },
  }
}

const geminiGoogleSearchSchema = z.object({
  query: z.string().describe('The prompt the llm gets which grounds its response with google search'),
})

export const geminiGoogleSearchFunc: FunctionDeclaration = {
  name: 'googleSearchTool',
  description:
    'Calls an llm which is grounded in google search. Use this tool to get latest news or data and access google search',
  parameters: zodToGeminiParameters(geminiGoogleSearchSchema) as unknown as FunctionDeclarationSchema,
}

const googleSearch = async ({ query }: Record<string, any>) => {
  console.log('google search', query)

  const request: GenerateContentRequest = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: query,
          },
        ],
      },
    ],
    tools: [
      {
        googleSearchRetrieval: {},
      },
    ],
    systemInstruction: 'You are a helpful AI assistant. You **MUST ALWAYS** execute the google grounding',
    generationConfig: {
      temperature: 0.7,
    },
  }

  const { response } = await model.generateContent(request)

  console.log(response.candidates?.[0])

  return {
    name: 'googleSearchTool',
    response: {
      result: response.candidates?.[0],
    },
  }
}

// fetch(
//   'https://fred.stlouisfed.org/graph/fredgraph.csv?bgcolor=%23e1e9f0&chart_type=line&drp=0&fo=open%20sans&graph_bgcolor=%23ffffff&height=450&mode=fred&recession_bars=on&txtcolor=%23444444&ts=12&tts=12&width=958&nt=0&thu=0&trc=0&show_legend=yes&show_axis_titles=yes&show_tooltip=yes&id=SOFR90DAYAVG&scale=left&cosd=2019-07-30&coed=2024-07-30&line_color=%234572a7&link_values=false&line_style=solid&mark_type=none&mw=3&lw=2&ost=-99999&oet=99999&mma=0&fml=a&fq=Daily&fam=avg&fgst=lin&fgsnd=2020-02-01&line_index=1&transformation=lin&vintage_date=2024-07-30&revision_date=2024-07-30&nd=2018-07-02',
//   {
//     headers: {
//       accept:
//         'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
//       'accept-language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
//       priority: 'u=0, i',
//       'sec-ch-ua': '"Not)A;Brand";v="99", "Google Chrome";v="127", "Chromium";v="127"',
//       'sec-ch-ua-mobile': '?0',
//       'sec-ch-ua-platform': '"macOS"',
//       'sec-fetch-dest': 'document',
//       'sec-fetch-mode': 'navigate',
//       'sec-fetch-site': 'same-origin',
//       'sec-fetch-user': '?1',
//       'upgrade-insecure-requests': '1',
//     },
//     referrer: 'https://fred.stlouisfed.org/series/SOFR90DAYAVG',
//     referrerPolicy: 'strict-origin-when-cross-origin',
//     body: null,
//     method: 'GET',
//     mode: 'cors',
//     credentials: 'include',
//   }
// )

export const handleFunctionCalling = async (callParts: FunctionCall[]) => {
  const promises: Promise<any>[] = []
  for (const callPart of callParts) {
    const { name, args } = callPart
    switch (name) {
      case 'vectorSearchTool':
        promises.push(vectorSearch(args))
        break
      case 'vectorSearchAddTool':
        promises.push(vectorStoreAddFunc(args))
        break
      case 'wikipediaQueryTool':
        promises.push(wikiQuery(args))
        break
      case 'puppeteerQueryTool':
        promises.push(pupQuery(args))
        break
      case 'puppeteerScreenshotTool':
        promises.push(pupScreenshot(args))
        break
      case 'youtubeVideoTool':
        promises.push(youtubeQuery(args))
        break
      case 'githubQueryTool':
        promises.push(githubQuery(args))
        break
      case 'recursiveUrlTool':
        promises.push(recursiveUrlLoader(args))
        break
      case 'sendEmailTool':
        promises.push(sendEmail(args))
        break
      case 'requestTool':
        promises.push(request(args))
        break
      case 'pythonTool':
        promises.push(executePython(args))
        break
      case 'googleSearchTool':
        promises.push(googleSearch(args))
        break
      default:
        throw new Error(`Unknown function call: ${name}`)
    }
  }

  const results = await Promise.allSettled(promises)
  const functionResults: FunctionResponsePart[] = results.map((result) => {
    if (result.status === 'fulfilled') {
      return { functionResponse: result.value }
    } else {
      return { functionResponse: `Error: ${result.reason}` }
    }
  })
  return functionResults
}
