// Builds agent/tools.json, the deposit agent tool pack that the docs link to, from the
// tool definitions in agent/tools/ and the system prompt in agent/agent/prompt.js. Reads the source
// files as text, so it needs no dependencies, credentials or database.
//   node scripts/build-tools-json.mjs           write agent/tools.json
//   node scripts/build-tools-json.mjs --check   fail if agent/tools.json is out of date
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const FORMAT_VERSION = 3
const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const target = new URL('agent/tools.json', root)
const check = process.argv.includes('--check')

// The tools, in the order agent/tools/index.js imports them.
const index = read('agent/tools/index.js')
const files = [...index.matchAll(/^import \{ \w+ \} from "\.\/([\w-]+)\.js";$/gm)].map((m) => m[1])
if (files.length === 0) throw new Error('Found no tool imports in agent/tools/index.js')

const tools = files.map((file) => {
  const path = `agent/tools/${file}.js`
  const source = read(path)
  // Each tool file exports one object: name, description and schema, then its handler.
  const start = source.indexOf('{', source.indexOf('export const '))
  const end = source.indexOf('\n  async handler(')
  if (start < 0 || end < start) throw new Error(`${path} doesn't have the expected layout (name, description, schema, then async handler)`)
  const { name, description, schema } = runInNewContext(`(${source.slice(start, end)}\n})`, {}, { timeout: 1000 })
  if (!name || !description || schema?.type !== 'object') throw new Error(`${path} is missing its name, description or object schema`)
  return { name, description, schema }
})

const promptSource = read('agent/agent/prompt.js')
if (!promptSource.includes('export const SYSTEM_PROMPT =')) throw new Error('agent/agent/prompt.js no longer exports SYSTEM_PROMPT')
const systemPrompt = runInNewContext(`${promptSource.replace('export const SYSTEM_PROMPT =', 'SYSTEM_PROMPT =')}\nSYSTEM_PROMPT`, {}, { timeout: 1000 }).trimStart()

// version is the date the definitions or prompt last changed, so rebuilding without a change keeps it.
const current = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : null
const same = (a) => a && a.formatVersion === FORMAT_VERSION && a.systemPrompt === systemPrompt && JSON.stringify(a.tools) === JSON.stringify(tools)
const version = same(current) ? current.version : new Date().toISOString().slice(0, 10)
const output = JSON.stringify({ formatVersion: FORMAT_VERSION, version, systemPrompt, tools }, null, 2) + '\n'

if (check) {
  if (!same(current)) {
    console.error('agent/tools.json is out of date with agent/tools/ or agent/agent/prompt.js. Run: node scripts/build-tools-json.mjs')
    process.exit(1)
  }
  console.log(`agent/tools.json is current: ${tools.length} tools and the system prompt, version ${current.version}`)
} else {
  writeFileSync(target, output)
  console.log(`Wrote agent/tools.json: ${tools.length} tools and the system prompt, version ${version}`)
}
