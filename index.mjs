import JestHasteMap from 'jest-haste-map'
import yargs from 'yargs'
import chalk from 'chalk'
import Resolver from 'jest-resolve'
import fs from 'fs'

import { cpus } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

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

console.log(chalk.bold(`❯ Building ${chalk.blue(options.entryPoint)}`))

const resolver = new Resolver.default(moduleMap, {
  extensions: ['.js'],
  hasCoreModules: false,
  rootDir: root,
})

const seen = new Set()
const modules = new Map()
const queue = [entryPoint]
let id = 0 // we're gonna reference modules by id not string

while (queue.length) {
  const module = queue.shift()

  if(seen.has(module)) continue // a guard against circular dependencies

  seen.add(module)
  // entry-point: Map<string, string>
  // ['./apple', 'path/to/apple.js']
  const dependencyMap = new Map(
    hasteFS
      .getDependencies(module)
      .map((dependencyName) => [
        dependencyName,
        resolver.resolveModule(module, dependencyName),
      ]),
  )
  const code = fs.readFileSync(module, 'utf8')

  const metadata = {
    id: id++, // we have a unique ascending id for each module. entry point will always be 0
    code,
    dependencyMap,
  }
  modules.set(module, metadata)
  queue.push(...dependencyMap.values())
}
console.log(modules)
console.log(chalk.bold(`❯ Found ${chalk.blue(seen.size)} files`));
console.log(chalk.bold(`❯ Serializing bundle`))

const wrapModule = (id, code) => {
  return `define(${id}, function(module, exports, require) {\n${code}});`
}

// we're processing the dependency map in the reverse order. So the first element in the reversed map won't have any deps
// then we're moving on, and we're just replacing the require statements with the code that's in the files they require
// thus we know that all the dependencies are resolved the moment we start processing them. The final result will have
// no require statements anywhere
const output = []
for (const [module, metadata] of Array.from(modules).reverse()) {
   let { id, code } = metadata

   for (const [dependencyName, dependencyPath] of metadata.dependencyMap) {
       const dependency = modules.get(dependencyPath)
       // Swap out the reference the required module with the generated
       // module it. We use regex for simplicity. A real bundler would likely
       // do an AST transform using Babel or similar.
       code = code.replace(
         new RegExp(
    `require\\(('|")${dependencyName.replace(/[\/.]/g, '\\$&')}\\1\\)`,
         ),
         `require(${dependency.id})`,
       )
  }

  output.push(wrapModule(id, code))
}

// Add the `require`-runtime at the beginning of our bundle.
output.unshift(fs.readFileSync('./require.js', 'utf8'))
// And require the entry point at the end of the bundle.
output.push(['requireModule(0);'])
// Write it to stdout.
console.log(output.join('\n'))

console.log(modules.get(entryPoint).code)
