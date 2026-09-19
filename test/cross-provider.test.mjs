import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createCitationNumbering as ragflowNumbering } from '../dist/citations.js'
import { SOURCE_MARKER as RAG_MARKER } from '../dist/sources.js'

const siblingCitations = new URL('../../dsh-weknora/dist/citations.js', import.meta.url)
const siblingSources = new URL('../../dsh-weknora/dist/sources.js', import.meta.url)
const siblingAvailable = process.env.RAGFLOW_TEST_STANDALONE !== '1'
  && existsSync(fileURLToPath(siblingCitations))
  && existsSync(fileURLToPath(siblingSources))
const WEK_MARKER = siblingAvailable
  ? (await import(siblingSources.href)).SOURCE_MARKER
  : 'WeKnora knowledge sources v2\n'

// CI checks out this repository alone. This fixture implements the public
// shared-numbering contract; a local checkout beside dsh-weknora exercises
// the real provider implementation instead.
const contractWeKnoraNumbering = ownerFor => {
  const sharedKey = Symbol.for('aiko-dsh.knowledge-citation-numbering')
  const agents = globalThis[sharedKey] ??= new WeakMap()
  return (sources, exec) => {
    const agent = ownerFor(exec)
    const events = agent?.session.snapshotEvents() ?? []
    const start = events.findLastIndex(row => row.type === 'turn/start')
    const turn = events[start]?.data.turn
    let state = agent ? agents.get(agent) : undefined
    if (!state || state.turn !== turn) {
      state = { turn, next: 1, entries: new Map() }
      if (agent) agents.set(agent, state)
    }
    for (const base of sources) for (const document of base.documents ?? []) for (const chunk of document.chunks ?? []) {
      const key = JSON.stringify(['weknora', base.id, document.id, chunk.id])
      let citation = state.entries.get(key)
      if (!citation) citation = { number: state.next++, url: '#weknora-cite=' + crypto.randomUUID() }
      state.entries.set(key, citation)
      chunk.citation = citation
    }
  }
}
const weknoraNumbering = siblingAvailable
  ? (await import(siblingCitations.href)).createCitationNumbering
  : contractWeKnoraNumbering

const signal = new AbortController().signal
const agent = events => ({ id: crypto.randomUUID(), session: { snapshotEvents: () => events } })
const start = { type: 'turn/start', data: { turn: 1 } }
const rag = id => [{ provider: 'RAGFlow', id: 'a', name: 'A', files: [{ id: 'file', name: 'Guide', chunks: [{ id, index: 0, content: 'RAG evidence' }] }] }]
const wek = id => [{ id: 'kb', name: 'KB', url: 'https://example.com/platform/knowledge-bases/kb', documents: [{ id: 'doc', title: 'Doc', fileName: 'doc.md', url: 'https://example.com/platform/knowledge-bases/kb?knowledge_id=doc', chunks: [{ id, index: 0, content: 'WeKnora evidence', truncated: false, modes: ['retrieval'] }] }] }]
const ragCitation = sources => sources[0].files[0].chunks[0].citation
const wekCitation = sources => sources[0].documents[0].chunks[0].citation
const event = (marker, sources) => ({ type: 'tool/result', data: { message: { content: [{ isError: false, content: [{ type: 'text', text: marker + JSON.stringify(sources) }] }] } } })

test('WeKnora and RAGFlow share unique numbers within either call order', () => {
  for (const order of ['weknora', 'ragflow']) {
    const owner = agent([start]), w = wek(order), r = rag(order)
    const numberW = weknoraNumbering(exec => exec.agent), numberR = ragflowNumbering(exec => exec.agent)
    if (order === 'weknora') { numberW(w, { agent: owner, signal }); numberR(r, { agent: owner, signal }) }
    else { numberR(r, { agent: owner, signal }); numberW(w, { agent: owner, signal }) }
    assert.deepEqual(new Set([wekCitation(w).number, ragCitation(r).number]), new Set([1, 2]))
  }
})

test('either provider can restore the shared next number from durable history', () => {
  const w = wek('old'), r = rag('old')
  const first = agent([start])
  weknoraNumbering(exec => exec.agent)(w, { agent: first, signal })
  ragflowNumbering(exec => exec.agent)(r, { agent: first, signal })
  const history = [start, event(WEK_MARKER, w), event(RAG_MARKER, r)]
  const replay = agent(history), next = rag('new')
  ragflowNumbering(exec => exec.agent)(next, { agent: replay, signal })
  assert.equal(ragCitation(next).number, 3)
})
