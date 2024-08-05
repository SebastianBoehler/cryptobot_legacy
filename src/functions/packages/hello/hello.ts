function handler(args) {
  let name = args.name || 'stranger'
  let greeting = 'Hello ' + name + '!'
  console.log(greeting)
  return { body: greeting }
}

export const main = handler
