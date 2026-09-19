import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createMcpPort } from '../dist/mcp.js'
import { resolveConfig } from '../dist/config.js'

test('official Streamable HTTP calls use DSH credentials and forced retrieval scope', async t => {
  const calls = []
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/mcp') { response.writeHead(405).end(); return }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!('id' in input)) { response.writeHead(202).end(); return }
    calls.push({ method: input.method, params: input.params, authorization: request.headers.authorization })
    let result
    if (input.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'ragflow-fixture', version: '1' } }
    else if (input.method === 'tools/call' && input.params.name === 'ragflow_list_datasets') result = { content: [{ type: 'text', text: JSON.stringify({ id: 'dataset-1', name: 'Docs', description: '' }) + '\n' + JSON.stringify({ id: 'dataset-2' }) }] }
    else if (input.method === 'tools/call' && input.params.name === 'ragflow_retrieval') result = { content: [{ type: 'text', text: JSON.stringify({ chunks: [{ id: 'chunk', dataset_id: 'dataset-1', document_id: 'file', content_with_weight: 'Evidence' }] }) }] }
    else { response.writeHead(404).end(); return }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: input.id, result }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  let secret = 'fixture-secret'
  const port = createMcpPort(resolveConfig({ mcpUrl: `http://127.0.0.1:${server.address().port}/mcp` }), { resolve: async () => ({ value: secret }) })
  const signal = new AbortController().signal
  assert.deepEqual(await port.listDatasets(signal), [{ id: 'dataset-1', name: 'Docs', description: '' }, { id: 'dataset-2', name: 'dataset-2', description: '' }])
  secret = 'rotated-secret'
  assert.equal((await port.retrieve({ question: 'Q', dataset_ids: ['dataset-1'], page: 1, page_size: 10 }, signal)).chunks[0].content_with_weight, 'Evidence')
  assert.equal(calls.find(call => call.params?.name === 'ragflow_list_datasets').authorization, 'Bearer fixture-secret')
  assert.equal(calls.find(call => call.params?.name === 'ragflow_retrieval').authorization, 'Bearer rotated-secret')
  assert.deepEqual(calls.find(call => call.params?.name === 'ragflow_retrieval').params.arguments.dataset_ids, ['dataset-1'])
  assert.deepEqual(calls.find(call => call.params?.name === 'ragflow_retrieval').params.arguments.document_ids, [])
})
