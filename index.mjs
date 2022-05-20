import JestHasteMap from 'jest-haste-map'
import yargs from 'yargs'
import chalk from 'chalk'
import Resolver from 'jest-resolve'
import fs from 'fs'

import { cpus } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { DependencyResolver } from 'jest-resolve-dependencies'

const root = join(dirname(fileURLToPath(import.meta.url)), 'product')

const hasteMapOptions = {
  extensions: ['js'],
  maxWorkers: cpus().length,
  name: 'jest-bundler',
  platforms: [],
  rootDir: root,
  roots: [root],
}

const hasteMap = new JestHasteMap.default(hasteMapOptions)

await hasteMap.setupCachePath(hasteMapOptions)
const { hasteFS, moduleMap } = await hasteMap.build()

const options = yargs(process.argv).argv
const entryPoint = resolve(process.cwd(), options.entryPoint)
if (!hasteFS.exists(entryPoint))
  throw new Error('`--entry-point` does not exist. Please provide a path to a valid file.')

const resolver = new Resolver.default(moduleMap, {
  extensions: ['.js'],
  hasCoreModules: false,
  rootDir: root,
})

const dependencyResolver = new DependencyResolver(resolver, hasteFS)
// this will resolve only the entryPoint's dependencies. We need to resolve it recursively.
const allFiles = new Set() // that's a list of all the files we'll include in the bundle
const queue = [entryPoint]
while (queue.length) {
  const module = queue.shift()

  if(allFiles.has(module)) continue // a guard against circular dependencies

  allFiles.add(module)
  queue.push(...dependencyResolver.resolve(module))
}
console.log(chalk.bold(`❯ Found ${chalk.blue(allFiles.size)} files`))
console.log(Array.from(allFiles))
console.log(chalk.bold(`❯ Building ${chalk.blue(options.entryPoint)}`))
console.log(chalk.bold(`❯ Serializing bundle`))

const allCode = []
await Promise.all(Array.from(allFiles).map(async (file) => {
  const code = await fs.promises.readFile(file, 'utf8')
  allCode.push(code)
}))

console.log(allCode.join('\n'))
