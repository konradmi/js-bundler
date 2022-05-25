const { transformSync } = require('@babel/core')

// we're gonna run this in parallel. Transformation/compilation is CPU heavy process that's easy to parallelize
exports.transformFile = function (code) {
  const transformResult = { code: '' }
  try {
    transformResult.code = transformSync(code, {
      // because of this plugin we can mix require with imports and not care about *.mjs files
      plugins: ['@babel/plugin-transform-modules-commonjs'],
    }).code
  } catch (error) {
    transformResult.errorMessage = error.message
  }
  return transformResult
}
