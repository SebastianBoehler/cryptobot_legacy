import * as shell from 'shelljs'
import * as path from 'path'

// Define source and destination paths
const filesToCopy = ['src/solana/my-new-keypair.json', 'src/solana/idl.json']

const buildDirectory = 'build/solana'

// Copy each file to the build directory
filesToCopy.forEach((file) => {
  const destPath = path.join(buildDirectory, path.basename(file))
  shell.cp(file, destPath)
  console.log(`Copied ${file} to ${destPath}`)
})
