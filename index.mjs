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
  const moduleBody = code.match(/module\.exports\s+=\s+(.*?);/)?.[1] || '' //whatever is exported from the module

  const metadata = {
    code: moduleBody || code,
    dependencyMap,
  }
  modules.set(module, metadata)
  queue.push(...dependencyMap.values())
}
console.log(modules)
console.log(chalk.bold(`❯ Found ${chalk.blue(seen.size)} files`));
console.log(chalk.bold(`❯ Serializing bundle`))

// we're processing the dependency map in the reverse order. So the first element in the reversed map won't have any deps
// then we're moving on, and we're just replacing the require statements with the code that's in the files they require
// thus we know that all the dependencies are resolved the moment we start processing them. The final result will have
// no require statements anywhere
for (const [module, metadata] of Array.from(modules).reverse()) {
   let { code } = metadata

   for (const [dependencyName, dependencyPath] of metadata.dependencyMap) {
     // Inline the module body of the dependency into the module that requires it.
     code = code.replace(
       new RegExp(
         // Escape `.` and `/`.
        `require\\(('|")${dependencyName.replace(/[\/.]/g, '\\$&')}\\1\\)`,
        ),
        modules.get(dependencyPath).code,
    )
  }

  metadata.code = code
}

console.log(modules.get(entryPoint).code)
