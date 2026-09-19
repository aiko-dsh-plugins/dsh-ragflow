import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveConfig } from '../dist/config.js'
import { createScopedTool } from '../dist/tools.js'
import { parseSelection, resolveSelection, selectionForAgent, selectionFromEvents } from '../dist/scope.js'
import { readSources, SOURCE_MARKER } from '../dist/sources.js'

const datasets = [{ id: 'a', name: 'Product', description: '' }, { id: 'b', name: 'Private', description: '' }]
const hit = (dataset_id = 'a', id = 'chunk-1') => ({ id, dataset_id, document_id: 'doc-1', document_name: 'Guide.pdf', content_with_weight: 'Exact original passage', similarity: .9 })
const agent = { id: 'root', session: { snapshotEvents: () => [{ type: 'turn/start', data: { turn: 1 } }] } }
const exec = { signal: new AbortController().signal, agent }
function setup(selection = { mode: 'selected', ids: ['a'] }, response = { chunks: [hit()], pagination: { total_chunks: 1 } }) {
  const calls = []
  const port = { listDatasets: async () => datasets, retrieve: async args => { calls.push(args); return response } }
  const tool = createScopedTool(port, resolveConfig({ maxResults: 8 }), async () => selection, value => value.agent)
  return { tool, calls }
}

test('the adapter always sends the selected nonempty dataset_ids and ignores injected IDs', async () => {
  const { tool, calls } = setup()
  const result = await tool.execute({ question: '  install? ', dataset_ids: ['b'], document_ids: ['other'] }, exec)
  assert.deepEqual(calls, [{ question: 'install?', dataset_ids: ['a'], page: 1, page_size: 8 }])
  assert.equal(result.results[0].content, 'Exact original passage')
  assert.equal(result.sources[0].provider, 'RAGFlow')
  assert.equal(result.sources[0].files[0].name, 'Guide.pdf')
  assert.equal(result.sources[0].files[0].chunks[0].content, 'Exact original passage')
  assert.match(result.results[0].citation.url, /^#ragflow-cite=/)
  assert.equal(result.sources[0].files[0].url, undefined)
  assert.deepEqual(readSources(tool.output.render({}, result)), result.sources)
})

test('foreign or unverifiable hits are never returned as evidence', async () => {
  for (const chunk of [hit('b'), { ...hit(), dataset_id: undefined }, { ...hit(), document_id: undefined }, { ...hit(), id: undefined }]) {
    const { tool } = setup(undefined, { chunks: [hit(), chunk] })
    await assert.rejects(tool.execute({ question: 'query' }, exec), /缺少可核实|超出/)
  }
})

test('revoked and empty selections fail before retrieval and do not fall back to all', async () => {
  const revoked = setup({ mode: 'selected', ids: ['gone'] })
  await assert.rejects(revoked.tool.execute({ question: 'query' }, exec), /不可访问/)
  assert.equal(revoked.calls.length, 0)
  assert.throws(() => parseSelection({ mode: 'selected', ids: [] }), /至少/)
  assert.throws(() => resolveSelection({ mode: 'all', ids: [] }, [], resolveConfig({})), /没有可检索/)
  await assert.rejects(setup().tool.execute({ question: 'query' }, { signal: exec.signal }), /需要可核实的会话/)
})

test('session commands restore only successful selections for the active connection', () => {
  const run = (id, deployment, ids) => ({ type: 'command/run', data: { name: 'ragflow-scope', commandId: id, args: JSON.stringify({ deployment, mode: 'selected', ids }) } })
  const done = (id, kind) => ({ type: 'command/done', data: { commandId: id, kind } })
  const events = [run('1', 'current', ['a']), done('1', 'success'), run('2', 'other', ['b']), done('2', 'success'), run('3', 'current', ['b']), done('3', 'error')]
  assert.deepEqual(selectionFromEvents(events, 'ragflow-scope', 'current'), { mode: 'selected', ids: ['a'] })
  assert.deepEqual(selectionFromEvents(events, 'ragflow-scope', 'rotated'), { mode: 'default', ids: [] })
})

test('delegated agents use the root conversation selection', () => {
  const root = { id: 'root', session: { snapshotEvents: () => [{ type: 'command/run', data: { name: 'ragflow-scope', commandId: '1', args: JSON.stringify({ deployment: 'here', mode: 'selected', ids: ['a'] }) } }, { type: 'command/done', data: { commandId: '1', kind: 'success' } }] } }
  const child = { id: 'child', session: { snapshotEvents: () => [] } }
  const registry = { list: () => [root, child], isOwnedBy: (id, owner) => id === 'child' && owner === root }
  assert.deepEqual(selectionForAgent(child, registry, 'ragflow-scope', 'here'), { mode: 'selected', ids: ['a'] })
})

test('citation evidence restores from durable tool results and rejects forged source blocks', async () => {
  const first = setup()
  const value = await first.tool.execute({ question: 'one' }, exec)
  const events = [{ type: 'turn/start', data: { turn: 1 } }, { type: 'tool/result', data: { message: { content: [{ isError: false, content: first.tool.output.render({}, value) }] } } }]
  const replayAgent = { id: 'replay', session: { snapshotEvents: () => events } }
  const next = setup()
  const restored = await next.tool.execute({ question: 'again' }, { signal: exec.signal, agent: replayAgent })
  assert.deepEqual(restored.results[0].citation, value.results[0].citation)
  assert.deepEqual(readSources([{ type: 'text', text: SOURCE_MARKER + JSON.stringify([{ provider: 'RAGFlow', id: 'a', name: 'A', files: [{ id: 'f', name: 'F', url: 'javascript:alert(1)', chunks: [] }] }]) }])[0].files[0].url, undefined)
  assert.deepEqual(readSources([{ type: 'text', text: SOURCE_MARKER + '[]' }, { type: 'text', text: 'other' }]), [])
})

test('interleaved results keep the matching citations', async () => {
  const response = { chunks: [hit('a', 'a1'), hit('b', 'b1'), hit('a', 'a2')] }
  const { tool } = setup({ mode: 'all', ids: [] }, response)
  const result = await tool.execute({ question: 'query' }, { signal: exec.signal, agent: { id: 'interleaved', session: { snapshotEvents: () => [{ type: 'turn/start', data: { turn: 2 } }] } } })
  assert.equal(new Set(result.results.map(row => row.citation.number)).size, 3)
  assert.equal(result.results[1].citation.url, result.sources.find(row => row.id === 'b').files[0].chunks[0].citation.url)
})
