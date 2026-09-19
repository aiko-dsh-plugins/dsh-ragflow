import test from 'node:test'
import assert from 'node:assert/strict'
import { installWeb } from '../dist/web.mjs'
import { selectionFromEvents } from '../dist/scope.js'
import { readSources, SOURCE_MARKER } from '../dist/sources.js'

function fixture() {
  const commands = new Map(), listeners = new Map(), events = []
  const agent = { status: 'idle', session: { snapshotEvents: () => events } }
  const other = { status: 'idle', session: { snapshotEvents: () => [] } }
  let rpc, seq = 0, deployment = 'connection'
  const ctx = {
    effect(fn) { fn() }, on(name, fn) { listeners.set(name, fn) },
    agents: { get: id => id === 'one' ? agent : id === 'two' ? other : undefined },
    commands: {
      register(def) { commands.set(def.name, def); return () => commands.delete(def.name) },
      async execute(target, line) {
        const id = ++seq, args = line.slice(line.indexOf(' ') + 1)
        events.push({ type: 'command/run', data: { name: 'ragflow-scope', commandId: id, args } })
        const result = await commands.get('ragflow-scope').handler({ agent: target, rawInput: args })
        events.push({ type: 'command/done', data: { commandId: id, kind: result.kind } })
        return { result }
      },
    },
    connection: { rpc: { handle(_path, handler) { rpc = handler; return () => {} } } },
  }
  const port = { listDatasets: async () => [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }
  installWeb(ctx, { port, config: { toolPrefix: 'ragflow', datasetIds: ['a'] }, command: 'ragflow-scope', deployment: async () => deployment,
    selection: async target => selectionFromEvents(target.session.snapshotEvents(), 'ragflow-scope', deployment) })
  return { agent, events, listeners, rotate: () => { deployment = 'rotated' }, call: (method, payload) => rpc(method, payload) }
}

test('RAGFlow RPC saves per-session scope in successful native commands', async () => {
  const f = fixture()
  const selected = await f.call('select', { sessionId: 'one', selection: { mode: 'selected', ids: ['b'] } })
  assert.equal(selected.ok, true)
  assert.deepEqual(selected.value.effective.map(row => row.id), ['b'])
  assert.deepEqual((await f.call('state', { sessionId: 'two' })).value.effective.map(row => row.id), ['a'])
  assert.doesNotMatch(JSON.stringify(selected), /credential|token|secret|deployment/)
  f.rotate()
  assert.deepEqual((await f.call('state', { sessionId: 'one' })).value.selection, { mode: 'default', ids: [] })
})

test('busy or unavailable selections do not change the previous scope', async () => {
  const f = fixture()
  await f.call('select', { sessionId: 'one', selection: { mode: 'selected', ids: ['a'] } })
  f.agent.status = 'running'
  assert.equal((await f.call('select', { sessionId: 'one', selection: { mode: 'selected', ids: ['b'] } })).ok, false)
  f.agent.status = 'idle'
  assert.equal((await f.call('select', { sessionId: 'one', selection: { mode: 'selected', ids: ['missing'] } })).ok, false)
  assert.deepEqual((await f.call('state', { sessionId: 'one' })).value.selection.ids, ['a'])
})

test('nested code results retain successful RAGFlow sources', async () => {
  const f = fixture()
  const source = { provider: 'RAGFlow', id: 'a', name: 'A', files: [{ id: 'f', name: 'Guide', chunks: [{ id: 'c', index: 0, content: 'Evidence' }] }] }
  const result = { isError: false, content: [{ type: 'text', text: SOURCE_MARKER + JSON.stringify([source]) }] }
  f.listeners.get('tools/result')({ agent: f.agent, parent: Symbol(), rootCallId: 'root', name: 'ragflow_search' }, result)
  const final = await f.listeners.get('tools/post-execute')({ agent: f.agent, callId: 'root' }, { isError: false, content: [{ type: 'text', text: 'done' }] }, async () => ({ kind: 'accept' }))
  assert.deepEqual(readSources(final.content), [source])
  f.listeners.get('tools/result')({ agent: f.agent, callId: 'root' }, { isError: false, content: final.content })
  assert.deepEqual(await f.listeners.get('tools/post-execute')({ agent: f.agent, callId: 'root' }, { isError: false, content: [] }, async () => ({ kind: 'accept' })), { kind: 'accept' })
})
