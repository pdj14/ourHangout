import { readFileSync } from 'node:fs'

const endpoint = process.env.AXONE_PLAYWRIGHT_MCP_URL
const toolName = process.argv[2]
const stdinArguments = process.stdin.isTTY ? '' : readFileSync(0, 'utf8').trim()
const rawArguments = (process.argv[3] ?? stdinArguments) || '{}'

if (!endpoint) {
  console.error('AI Browser is not connected to this Agent. Turn Browser ON and restart the Agent.')
  process.exit(1)
}
if (!toolName) {
  console.error('Usage: node mcp-call.mjs <tool-name> [json-arguments]')
  process.exit(1)
}

let toolArguments
try {
  toolArguments = JSON.parse(rawArguments)
} catch {
  console.error('Tool arguments must be valid JSON.')
  process.exit(1)
}

const headers = {
  accept: 'application/json, text/event-stream',
  'content-type': 'application/json',
}

function parseResponse(value) {
  const dataLine = value.split(/\r?\n/).find((line) => line.startsWith('data: '))
  return JSON.parse(dataLine ? dataLine.slice(6) : value)
}

async function post(payload, sessionId) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: sessionId ? { ...headers, 'mcp-session-id': sessionId } : headers,
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `MCP request failed (${response.status})`)
  return { payload: text ? parseResponse(text) : null, sessionId: response.headers.get('mcp-session-id') }
}

function boundedContent(content) {
  return (content ?? []).map((item) => {
    if (item.type === 'text') return { type: 'text', text: String(item.text ?? '').slice(0, 30_000) }
    if (item.type === 'image') {
      return { type: 'image', mimeType: item.mimeType, note: 'Image payload omitted from terminal output.' }
    }
    return item
  })
}

try {
  const initialized = await post({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'axone-playwright-skill', version: '1.0' },
    },
  })
  const sessionId = initialized.sessionId
  if (!sessionId) throw new Error('Playwright MCP did not return a session id.')

  await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId)
  const result = await post({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: toolName, arguments: toolArguments },
  }, sessionId)

  const response = result.payload
  if (response?.error) throw new Error(response.error.message ?? JSON.stringify(response.error))
  const toolResult = response?.result
  console.log(JSON.stringify({ ...toolResult, content: boundedContent(toolResult?.content) }, null, 2))
  if (toolResult?.isError) process.exitCode = 1
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
