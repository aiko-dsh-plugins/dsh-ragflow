import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { apply } from '../dist/index.js'
import { resolveConfig } from '../dist/config.js'

test('native prompt assembly marks the current adapter scope and delegates the waterfall', async () => {
  let hook
  const config = resolveConfig({})
  const deployment = createHash('sha256').update(JSON.stringify([config.mcpUrl, config.credentialRef, ''])).digest('hex')
  const events = []
  const agent = { id: 'test', session: { snapshotEvents: () => events } }
  apply({ tools: { register() {} }, credentials: { async resolve() {} }, inject() {}, on(event, callback) { assert.equal(event, 'system-prompt/assemble'); hook = callback } }, {})
  let delegated = 0
  const assemble = () => hook({}, { scope: agent }, async () => { delegated++; return { sections: [] } })
  assert.match((await assemble()).sections[0].text, /disabled/)
  events.push({ type: 'command/run', data: { name: 'ragflow-scope', commandId: 'pick', args: JSON.stringify({ deployment, mode: 'selected', ids: ['a'] }) } }, { type: 'command/done', data: { commandId: 'pick', kind: 'success' } })
  assert.match((await assemble()).sections[0].text, /scope: enabled/)
  assert.equal(delegated, 2)
})
