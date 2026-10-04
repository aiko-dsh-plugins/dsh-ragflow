import test from 'node:test'
import assert from 'node:assert/strict'
import { createScopedTool } from '../dist/tools.js'
import { resolveConfig } from '../dist/config.js'
import { readSources } from '../dist/sources.js'

test('a selected source remains visible to the model when retrieval has no matching evidence', async () => {
  const agent = { id: 'selected-inventory', session: { snapshotEvents: () => [] } }
  const tool = createScopedTool({
    listDatasets: async () => [{ id: 'selected', name: 'Local Installation Test' }, { id: 'other', name: 'Unselected data' }],
    retrieve: async args => { assert.deepEqual(args.dataset_ids, ['selected']); return { chunks: [] } },
  }, resolveConfig({}), async () => ({ mode: 'selected', ids: ['selected'] }), () => agent)
  const value = await tool.execute({ question: 'Which sources are selected?' }, { agent, signal: new AbortController().signal })
  assert.deepEqual(value.selected_sources, [{ name: 'Local Installation Test' }])
  assert.equal(value.results.length, 0)
  const rendered = tool.output.render({}, value)
  assert.match(rendered[0].text, /Local Installation Test/)
  assert.match(rendered[0].text, /本检索通道/)
  assert.match(rendered[0].text, /不代表未选择/)
  assert.doesNotMatch(rendered[0].text, /Unselected data/)
  assert.deepEqual(readSources(rendered), [], 'selection metadata must not become citation evidence')
})

test('selection inventory includes sources without hits alongside those that return evidence', async () => {
  const agent = { id: 'partial-evidence', session: { snapshotEvents: () => [] } }
  const tool = createScopedTool({
    listDatasets: async () => [{ id: 'a', name: 'Guide' }, { id: 'b', name: 'Operations' }],
    retrieve: async () => ({ chunks: [{ id: 'chunk-a', dataset_id: 'a', document_id: 'doc-a', document_name: 'Manual', content: 'Verified passage' }] }),
  }, resolveConfig({}), async () => ({ mode: 'selected', ids: ['a', 'b'] }), () => agent)
  const value = await tool.execute({ question: 'installation' }, { agent, signal: new AbortController().signal })
  assert.deepEqual(value.selected_sources, [{ name: 'Guide' }, { name: 'Operations' }])
  assert.equal(value.sources.length, 1)
  assert.equal(value.sources[0].name, 'Guide')
  assert.match(tool.output.render({}, value)[0].text, /Operations/)
})
