import test from 'node:test'
import assert from 'node:assert/strict'
import { createCitationNumbering as ragflowNumbering } from '../dist/citations.js'
import { createCitationNumbering as weknoraNumbering } from '../../dsh-weknora/dist/citations.js'
import { SOURCE_MARKER as RAG_MARKER } from '../dist/sources.js'
import { SOURCE_MARKER as WEK_MARKER } from '../../dsh-weknora/dist/sources.js'

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
