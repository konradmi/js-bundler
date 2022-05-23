// that's basically the runtime for our bundler. We want to include that on top of every bundle we create
const modules = new Map()

// it's only for registering modules. it's not execution
const define = (name, moduleFactory) => {
  modules.set(name, moduleFactory)
}

const moduleCache = new Map()

const requireModule = (name) => {
  // If this module has already been executed, return a reference to it. Every module is executed only once
  if (moduleCache.has(name)) {
    return moduleCache.get(name).exports
  }

  if (!modules.has(name)) {
    throw new Error(`Module '${name}' does not exist.`)
  }

  const moduleFactory = modules.get(name)

  const module = {
    exports: {},
  }
  // Set the moduleCache with "empty module object" immediately so that we do not run into infinite loops with circular dependencies.
  moduleCache.set(name, module)
  // Execute the module factory in the runtime. It will likely mutate the `module` object.
  moduleFactory(module, module.exports, requireModule)

  return module.exports
}

// that's how it will be used. this part will be generated on the fly
// define('tomato', function (module, exports, require) {
//   module.exports = 'tomato';
// })
//
// define('melon', function (module, exports, require) {
//   module.exports = 'melon';
// })
//
// define('kiwi', function (module, exports, require) {
//   module.exports = 'kiwi ' + require('./melon') + ' ' + require('./tomato');
// })
