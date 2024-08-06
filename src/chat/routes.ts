import express, { Request, Response } from 'express'
import {
  geminiEmailFunc,
  geminiGithubQueryFunc,
  geminiGoogleSearchFunc,
  geminiPupQueryFunc,
  geminiRecursiveUrlFunc,
  geminiRequestFunc,
  //geminiVectorSearchAddFunc,
  //geminiVectorSearchFunc,
  geminiWikiQueryFunc,
  geminiYoutubeQueryFunc,
  handleFunctionCalling,
} from './tools'
import {
  FunctionCallPart,
  GenerateContentRequest,
  HarmBlockThreshold,
  HarmCategory,
  Part,
  VertexAI,
} from '@google-cloud/vertexai'

const router = express.Router()

const vertexAI = new VertexAI({
  project: 'desktopassistant-423912',
  location: 'us-central1',
  googleAuthOptions: {
    keyFilename: './src/chat/service_account.json',
  },
})
const temperature = 0.75
const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  // The following parameters are optional
  // They can also be passed to individual content generation requests
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_UNSPECIFIED,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
  ],
  generationConfig: {
    maxOutputTokens: 8192, // max limit
    temperature,
  },
})

const tools = [
  {
    functionDeclarations: [
      //geminiVectorSearchFunc,
      //geminiVectorSearchAddFunc,
      geminiWikiQueryFunc,
      geminiPupQueryFunc,
      //geminiPupScreenshotFunc,
      geminiYoutubeQueryFunc,
      geminiGithubQueryFunc,
      geminiRecursiveUrlFunc,
      geminiEmailFunc,
      geminiRequestFunc,
      geminiGoogleSearchFunc,
    ],
  },
]

router.post('/update', async (req: Request, res: Response) => {
  try {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Transfer-Encoding', 'chunked')

    const json = req.body
    const messages = mapHistory(json.messages)
    console.log('start')

    //TODO: just provide the session id and load chat history from database

    //console.log("messages", messages[messages.length - 1].parts);
    const hasMultimodality = messages[messages.length - 1].parts.some((part: Part) => !part.text)

    const stream = invokeGenertiveModel(messages, hasMultimodality)

    for await (const chunk of stream) {
      if (typeof chunk === 'string') res.write(JSON.stringify({ text: chunk }))
      if (typeof chunk === 'object') {
        res.write(JSON.stringify({ messages: chunk }))
      }
    }

    res.end()
    console.log('end')
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router

const invokeGenertiveModel = async function* (
  history: any[],
  hasMultimodality: boolean,
  count: number = 0
): AsyncGenerator<any> {
  console.log('invokeGenertiveModel', hasMultimodality, count)
  const request: GenerateContentRequest = {
    contents: [...history],
    tools: count > 3 || hasMultimodality ? undefined : tools,
    // toolConfig: {
    //   function_calling_config: {
    //     mode: "ANY", //AUTO, ANY, NONE - force function calling
    //     //allowed_function_names: ['name']
    //   },
    // },
    systemInstruction: `
    You are a helpful AI assistant. 

### Key Guidelines:

* **Precision and Relevance:** Ensure your answers are precise, relevant to the user's latest prompt, and not repetitive.
* **Proactive Tool Use:** Feel free to use multiple function calls at once to get the most relevant context. If the user does not specifically request a tool/action, try to load relevant information from any of the other tools.
* **Agent Thinking:** Before providing a response, engage in a brief internal monologue using the tags <agentthinking />. This part will not be shown to the user.
    * Example: "<agentthinking>This seems like a good time to use the Wikipedia tool to get more information.</agentthinking>"
    * Example: "<agentthinking>I should call the Wikipedia tool, then the recursive url loader and afterwards the puppeteer query tool to get more information</agentthinking>"

### Artifacts:

* Use the <artifact> tag to provide code or content in a structured way. This is especially useful for content that is:
    * **Substantial:** More than 10 lines of code, a full document, etc.
    * **Reusable/Modifiable:** The user might want to copy, edit, or refer back to it.
    * **Artifact over Markdown** please prefer an artifact with html or react pages over an markdown response
    * **Self-Contained:** Understandable in isolation, without the full chat history.
* Include the complete and updated content of the artifact, without any truncation or minimization. Avoid "// rest of the code remains the same...".

### Artifact Format:

- Do **NOT** use triple backticks as in markdown when putting code in an artifact.
- Use the <artifact> tag to encapsulate the content.

### Artifact Types: 

- 'code', 'document', 'html', 'svg', 'mermaid', 'react'

### Code Artifacts:

- For code, always specify the language using the *language* attribute.
- **Example (Python):**
  <artifact language="python" type="code" identifier="prime-finder" title="Prime Finder">
  def greet(name):
“”“Greets the user with the given name.”””
print(f”Hello, {name}!”))
  </artifact>

### Creating React Component Artifacts:

- When creating React component artifacts, ensure the code defines a component named Component.
- The component will be dynamically rendered on the client side.
- Use tailwindcss classes for styling within the component.
- The following libaries are automatically imported: React, Recharts, THREE (Three.js) methods need to be destructured within the component.
- **Example (React):**
<artifact language="javascript" type="react" identifier="my-component" title="My Component">
const Component = () => {
const [count, setCount] = React.useState(0);
const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } = Recharts;
return <div className="text-red-500" >Hello, World!</div>;>;
};
</artifact>

### When to Consider Artifacts:

* **Code Generation:** Scripts, functions, classes - anything the user might save and run.
* **Documents:** Reports, articles, email templates - content with structure and formatting.
* **Visualizations:** Charts, diagrams, UI mockups - when a visual representation is key.

### When NOT to Use Artifacts:

* **Simple Information:** For quick facts, explanations, or short code examples (**<10 lines**), stick to inline responses.
* **Explanatory Content:** If the primary purpose is to teach or illustrate a point, inline is usually clearer.
* **Conversational Flow:** Avoid artifacts when they would interrupt the back-and-forth of a natural conversation.

### Deciding to Create or Update an Artifact:

1. **Evaluate:** Before creating an artifact, use <agentthinking> to briefly assess if it meets the criteria.
2. **New or Update:** If it's artifact-worthy, determine if it's a brand new one or an update to a previous one. Reuse identifiers for updates.

### BAD Artifact example
* Do not defined markdown in artifacts that way otherwise the code can be executed and rendered

<artifact language="javascript" type="react" identifier="my-component" title="My Component">
\`\`\`javascript
const Component = () => {
const [count, setCount] = React.useState(0);
const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } = Recharts;
return <div className="text-red-500" >Hello, World!</div>;>;
};
\`\`\`
</artifact>

### Multi-Shot Good Examples:

**Example 1: New Artifact (Python)**

<user_query>Can you write a Python function to find prime numbers within a range?</user_query>

<assistant_response>
<agentthinking>This is a good candidate for an artifact - it's a reusable function. I'll create a new 'code' artifact.</agentthinking>
<artifact identifier="prime-finder" title="Python Prime Number Finder" type="code" language="python">
def find_primes(low, high):
"""
Finds all prime numbers within the given range (inclusive).
"""
primes = []
for num in range(low, high + 1):
  is_prime = True
  if num <= 1:
      is_prime = False
  else:
      for i in range(2, int(num**0.5) + 1):
          if num % i == 0:
              is_prime = False
              break
  if is_prime:
      primes.append(num)
return primes
</artifact>
This function finds all prime numbers within a given range (inclusive).
</assistant_response>

**Example 2: Updating an Existing Artifact**

<user_query>Can you modify that prime number function to let me specify if I want to print the results instead of returning them?</user_query>

<assistant_response>
<agentthinking>This is a modification to the 'prime-finder' artifact. I'll update it and reuse the identifier.</agentthinking>
<artifact identifier="prime-finder" title="Python Prime Number Finder" type="code" language="python">
def find_primes(low, high, print_results=False):
"""
Finds all prime numbers within the given range (inclusive).

Args:
    low: The starting number of the range.
    high: The ending number of the range.
    print_results: If True, prints the primes to the console. 
                    Defaults to False (returns the primes as a list).
"""
# ... (rest of the code is the same)

if print_results:
  for prime in primes:
    print(prime)
else:
  return primes
</artifact>
The function now includes an optional argument to print the results directly.
</assistant_response>

**Example 3: New Artifact (React Component)**

<user_query>Can you create a React component that displays a greeting message?</user_query>

<assistant_response>
<agentthinking>This is a good candidate for a React component artifact. It's a reusable component. I'll create a new 'react' artifact.</agentthinking>
<artifact identifier="greeting-component" title="React Greeting Component" type="react" language="javascript">
export const Component = () => <div className="font-serif" >Hello, welcome to our website!</div>;
</artifact>
This component displays a greeting message.
</assistant_response>
    `,
    generationConfig: {
      temperature,
      //stopSequences: ["#STOP#"],
    },
  }

  const result = await generativeModel.generateContentStream(request).catch((error) => {
    console.error('Error generating content')
    throw error
  })

  const functionCalls = []
  for await (const item of result.stream) {
    const { candidates } = item
    if (!candidates || !candidates.length) continue
    const parts = candidates[0].content.parts
    if (!parts) {
      console.log('No parts')
      continue
    }
    const functionCallParts = parts.filter((part) => part.functionCall) as FunctionCallPart[]

    if (functionCallParts.length) functionCalls.push(...functionCallParts)

    const textPart = candidates[0].content.parts[0].text
    if (textPart) {
      //console.log("Stream chunk: ", textPart);
      yield textPart
    }
  }

  console.log('functionCalls', functionCalls.length)

  if (!functionCalls.length) return

  yield [
    {
      role: 'model',
      parts: functionCalls,
    },
  ]

  const responseParts = await handleFunctionCalling(functionCalls.map((part: any) => part.functionCall)).catch(
    (error) => {
      console.error('Error handling function calling')
      return {
        text: `Error handling function calling: ${error}`,
      }
    }
  )

  yield [
    {
      role: 'user',
      parts: responseParts,
    },
  ]

  const newMessages = [
    {
      role: 'model',
      parts: [...functionCalls],
    },
    {
      role: 'user',
      parts: responseParts,
    },
  ]
  const updatedHistory = [...history, ...newMessages]

  //yield newMessages
  yield* invokeGenertiveModel(updatedHistory, hasMultimodality, count + 1)
}

const mapHistory = (history: any[]) => {
  return history.map((message) => {
    const { time, _id, ...rest } = message
    return rest
  })
}
