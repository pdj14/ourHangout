#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const rootIndex = args.indexOf('--root')
const filesIndex = args.indexOf('--files')
const root = resolve(rootIndex >= 0 && args[rootIndex + 1] ? args[rootIndex + 1] : process.cwd())
const explicitFiles = filesIndex >= 0 ? args.slice(filesIndex + 1).filter((value) => !value.startsWith('--')) : []

function gitFiles() {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) return []
  return String(result.stdout ?? '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .map((file) => file.includes(' -> ') ? file.split(' -> ').pop() : file)
    .filter(Boolean)
}

const files = [...new Set((explicitFiles.length ? explicitFiles : gitFiles())
  .map((file) => relative(root, resolve(root, file)).replaceAll('\\', '/'))
  .filter((file) => file && !file.startsWith('../')))]
  .slice(0, 500)

let scripts = {}
const packageFile = resolve(root, 'package.json')
if (existsSync(packageFile)) {
  try {
    scripts = JSON.parse(readFileSync(packageFile, 'utf8')).scripts ?? {}
  } catch {
    scripts = {}
  }
}

const code = files.some((file) => /\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|json)$/i.test(file))
const electron = files.some((file) => file.startsWith('electron/') || file.startsWith('shared/'))
const packaging = files.some((file) => /^(?:package(?:-lock)?\.json|electron-builder|scripts\/)/i.test(file))
const commands = []
const add = (script, reason) => {
  if (!scripts[script] || commands.some((item) => item.command === `npm run ${script}`)) return
  commands.push({ command: `npm run ${script}`, reason })
}

if (code) add(electron ? 'typecheck:mux' : 'typecheck', 'Type-check the affected application boundary.')
if (electron) add('typecheck:electron', 'Type-check Electron and shared main-process contracts.')
if (code) add('test:unit', 'Run deterministic unit coverage for changed behavior.')
if (packaging) add('build', 'Validate packaging or build-script changes after narrow checks pass.')

const risk = packaging || files.some((file) => /(?:auth|update|orchestrator|agentControl|persistence)/i.test(file))
  ? 'high'
  : code ? 'medium' : 'low'

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  root,
  changedFileCount: files.length,
  changedFiles: files,
  truncated: files.length >= 500,
  risk,
  commands: commands.slice(0, 4),
}, null, 2)}\n`)
