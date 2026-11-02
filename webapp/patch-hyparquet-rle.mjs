import { readFileSync, writeFileSync } from 'node:fs'

// Hyparquet 1.26.2 can extend its output array beyond the page's declared values.
// Keep this narrow patch version-checked so a dependency upgrade must be reviewed.
const packageUrl = new URL('./node_modules/hyparquet/package.json', import.meta.url)
const sourceUrl = new URL('./node_modules/hyparquet/src/encoding.js', import.meta.url)
const version = JSON.parse(readFileSync(packageUrl, 'utf8')).version

if (version !== '1.26.2') {
  throw new Error(`Review the Hyparquet RLE patch for version ${version}.`)
}

const original =
  '      const count = header >>> 1\n      readRle(reader, count, width, output, seen)'
const patched = [
  '      const count = header >>> 1',
  '      if (count === 0 || count > output.length - seen) {',
  "        throw new Error('parquet RLE run count exceeds declared value count')",
  '      }',
  '      readRle(reader, count, width, output, seen)',
].join('\n')
const source = readFileSync(sourceUrl, 'utf8')

if (!source.includes(patched)) {
  if (source.split(original).length !== 2) {
    throw new Error('Could not locate the expected Hyparquet RLE decoder code.')
  }

  writeFileSync(sourceUrl, source.replace(original, patched))
}
