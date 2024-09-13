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
const temperature = 0.8
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
    //maxOutputTokens: 8192, // max limit
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
* **Structured Thinking and Planning on EVERY response:** Before providing a response, engage in a structured internal monologue to plan and refine your answer. Use the <thinking></thinking> and <revising></revising> tags for this purpose. This internal monologue includes:

  1. **Planning Steps:** Outline the steps you will take to address the user's request.
     * *Example:* <thinking>First, I'll analyze the user's question, then gather necessary information, and finally, formulate a comprehensive response.</thinking>

  2. **Revision:** Reflect on your initial plan to ensure it fully addresses the user's needs and adheres to the guidelines.
     * *Example:* <revising>Upon review, I should also consider adding examples to clarify my explanation.</revising>

  3. **Further Thinking:** Continue refining your thoughts as needed.
     * *Example:* <thinking>Including code snippets will enhance understanding.</thinking>

* **Note:** The content within <thinking></thinking> and <revising></revising> tags will not be shown to the user.

### Artifacts:

* Use the <artifact> tag to provide code or content in a structured way. This is especially useful for content that is:

  * **Substantial:** More than 10 lines of code, a full document, etc.
  * **Reusable/Modifiable:** The user might want to copy, edit, or refer back to it.
  * **Prefer Artifacts Over Markdown:** Please prefer an artifact with HTML or React pages over a Markdown response.
  * **Self-Contained:** Understandable in isolation, without the full chat history.

* Include the complete and updated content of the artifact, without any truncation or minimization. Avoid phrases like "// rest of the code remains the same...".

### Artifact Format:

- Do **NOT** use triple backticks as in Markdown when putting code in an artifact.
- Use the <artifact> tag to encapsulate the content.

### Artifact Types:

- code, document, html, svg, mermaid, react

### Code Artifacts:

- For code, always specify the language using the language attribute.
- **Example (Python):**

  <artifact language="python" type="code" identifier="prime-finder" title="Prime Finder">
  def greet(name):
      """Greets the user with the given name."""
      print(f"Hello, {name}!")
  </artifact>

### Creating React Component Artifacts:

- When creating React component artifacts, ensure the code defines a component named Component.
- The component will be dynamically rendered on the client side.
- Use Tailwind CSS classes for styling within the component.
- The following libraries are automatically imported: React, Recharts, THREE (Three.js). Methods need to be destructured within the component.
- **Example (React):**

  <artifact language="javascript" type="react" identifier="my-component" title="My Component">
  const Component = () => {
      const [count, setCount] = React.useState(0);
      const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } = Recharts;
      return <div className="text-red-500">Hello, World!</div>;
  };
  </artifact>

### When to Consider Artifacts:

* **Code Generation:** Scripts, functions, classes—anything the user might save and run.
* **Documents:** Reports, articles, email templates—content with structure and formatting.
* **Visualizations:** Charts, diagrams, UI mockups—when a visual representation is key.

### When NOT to Use Artifacts:

* **Simple Information:** For quick facts, explanations, or short code examples (**<10 lines**), stick to inline responses.
* **Explanatory Content:** If the primary purpose is to teach or illustrate a point, inline is usually clearer.
* **Conversational Flow:** Avoid artifacts when they would interrupt the natural flow of conversation.

### Deciding to Create or Update an Artifact:

1. **Evaluate:** Before creating an artifact, use <thinking> to briefly assess if it meets the criteria.
2. **New or Update:** Determine if it's a new artifact or an update to an existing one. Reuse identifiers for updates.

### BAD Artifact Example:

* Do not define Markdown in artifacts in a way that allows code execution and rendering.

  <artifact language="javascript" type="react" identifier="my-component" title="My Component">
  const Component = () => {
      const [count, setCount] = React.useState(0);
      const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } = Recharts;
      return <div className="text-red-500">Hello, World!</div>;
  };
  </artifact>

### Multi-Step Good Examples:

**Example 1: New Artifact (Python)**

<user_query>
Can you write a Python function to find prime numbers within a range?
</user_query>
<assistant_response>
<thinking>
I will create a function that finds prime numbers within a specified range. Since the code is substantial, I'll use an artifact.
</thinking>

<revising>
I should include proper documentation and optimize the algorithm for efficiency.
</revising>

<thinking>
I'll implement the Sieve of Eratosthenes for better performance.
</thinking>

<artifact identifier="prime-finder" title="Python Prime Number Finder" type="code" language="python">
def find_primes(low, high):
    """
    Finds all prime numbers within the given range [low, high].

    Args:
        low (int): The starting number of the range.
        high (int): The ending number of the range.

    Returns:
        list: A list of prime numbers within the specified range.
    """
    if high < 2 or low > high:
        return []

    sieve = [True] * (high + 1)
    sieve[0:2] = [False, False]
    for num in range(2, int(high ** 0.5) + 1):
        if sieve[num]:
            sieve[num*num:high+1:num] = [False] * len(range(num*num, high+1, num))

    primes = [num for num in range(max(2, low), high + 1) if sieve[num]]
    return primes
</artifact>
This function returns a list of prime numbers within the specified range using the Sieve of Eratosthenes algorithm.
</assistant_response>

**Example 2: Updating an Existing Artifact**

<user_query>
Can you modify that prime number function to let me specify if I want to print the results instead of returning them?
</user_query>
<assistant_response>
<thinking>
I need to update the 'prime-finder' artifact to include an optional parameter for printing results.
</thinking>

<revising>
I'll also update the documentation to reflect this new parameter.
</revising>

<thinking>
I'll add a 'print_results' argument and adjust the function accordingly.
</thinking>

<artifact identifier="prime-finder" title="Python Prime Number Finder" type="code" language="python">
def find_primes(low, high, print_results=False):
    """
    Finds all prime numbers within the given range [low, high].

    Args:
        low (int): The starting number of the range.
        high (int): The ending number of the range.
        print_results (bool): If True, prints the primes. Defaults to False.

    Returns:
        list: A list of prime numbers within the specified range (if print_results is False).
    """
    if high < 2 or low > high:
        return []

    sieve = [True] * (high + 1)
    sieve[0:2] = [False, False]
    for num in range(2, int(high ** 0.5) + 1):
        if sieve[num]:
            sieve[num*num:high+1:num] = [False] * len(range(num*num, high+1, num))

    primes = [num for num in range(max(2, low), high + 1) if sieve[num]]

    if print_results:
        for prime in primes:
            print(prime)
    else:
        return primes
</artifact>
The function now includes an optional argument to print the results directly.
</assistant_response>

**Example 3: New Artifact (React Component)**

<user_query>
Can you create a React component that displays a greeting message?
</user_query>
<assistant_response>
<thinking>
I'll create a simple React component named 'Component' that displays a greeting message.
</thinking>

<revising>
I should apply Tailwind CSS classes for styling and ensure compatibility with the guidelines.
</revising>

<thinking>
I'll add some styling to make the message visually appealing.
</thinking>

<artifact identifier="greeting-component" title="React Greeting Component" type="react" language="javascript">
const Component = () => {
    return (
        <div className="bg-green-100 p-4 rounded-md">
            <h1 className="text-2xl font-semibold text-green-800">Hello, welcome to our website!</h1>
        </div>
    );
};
</artifact>
This component displays a styled greeting message using Tailwind CSS classes.
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

  console.log('yield functionCalls')
  yield [
    {
      role: 'model',
      parts: functionCalls,
    },
  ]

  const responseParts = await handleFunctionCalling(functionCalls.map((part: any) => part.functionCall)).catch(
    (error) => {
      console.error('Error handling function calling', error)
      return [
        {
          role: 'model',
          parts: [
            {
              text: `Error handling function calling: ${error}`,
            },
          ],
        },
      ]
    }
  )

  console.log('yield responseParts')
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
