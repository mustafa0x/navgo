import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir } from 'mk-dirs'
import prettyBytes from 'pretty-bytes'
import { gzipSizeSync } from 'gzip-size'
import { minify } from 'terser'
import pkg from './package.json' with { type: 'json' }

const ESM = readFileSync('src/index.js', 'utf8')

await mkdir('dist')

// Write ESM bundle as-is
writeFileSync(pkg.module, ESM)

// Minify ESM source to report gzip size only
const minOut = await minify(ESM, { toplevel: true, compress: { passes: 10 } })
if (minOut.error) throw minOut.error
console.log(`> gzip size: ${prettyBytes(gzipSizeSync(minOut.code))}`)
