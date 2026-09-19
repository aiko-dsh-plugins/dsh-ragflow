import { randomUUID } from 'node:crypto'
import type { ScopeAgent, ScopeEvent, ToolRunContext } from './harness.ts'
import { readSources, type DatasetSource } from './sources.ts'

interface Numbering { turn: unknown; next: number; entries: Map<string, { number: number; url: string }> }
const sharedKey = Symbol.for('aiko-dsh.knowledge-citation-numbering')
const agents = ((globalThis as unknown as Record<symbol, WeakMap<ScopeAgent, Numbering>>)[sharedKey] ??= new WeakMap<ScopeAgent, Numbering>())
const identity = (dataset: string, file: string, chunk: string) => JSON.stringify(['ragflow', dataset, file, chunk])
function otherHighest(blocks: readonly { type: string; text?: string }[]): number {
  const text = blocks.at(-1)?.text
  if (!text?.startsWith('WeKnora knowledge sources v2\n')) return 0
  try {
    const rows: unknown = JSON.parse(text.slice('WeKnora knowledge sources v2\n'.length))
    if (!Array.isArray(rows)) return 0
    let highest = 0
    for (const row of rows) for (const file of row?.documents ?? []) for (const chunk of file?.chunks ?? []) {
      const citation = chunk?.citation
      if (Number.isSafeInteger(citation?.number) && citation.number > 0 && typeof citation.url === 'string' && citation.url.includes('#weknora-cite=')) highest = Math.max(highest, citation.number)
    }
    return highest
  } catch { return 0 }
}
export function createCitationNumbering(ownerFor: (exec: ToolRunContext) => ScopeAgent | undefined) {
  return (sources: DatasetSource[], exec: ToolRunContext): void => {
    const agent = ownerFor(exec)
    const events = agent?.session.snapshotEvents() ?? [] as ScopeEvent[]
    const start = events.findLastIndex(event => event.type === 'turn/start')
    const turn = events[start]?.data.turn
    let state = agent ? agents.get(agent) : undefined
    if (!state || state.turn !== turn) {
      state = { turn, next: 1, entries: new Map() }
      for (const event of events.slice(start + 1)) {
        if (event.type !== 'tool/result') continue
        const message = event.data.message as { content?: { isError?: boolean; content?: { type: string; text?: string }[] }[] } | undefined
        const result = message?.content?.[0]
        if (result?.isError || !result?.content) continue
        state.next = Math.max(state.next, otherHighest(result.content) + 1)
        for (const dataset of readSources(result.content)) for (const file of dataset.files) for (const chunk of file.chunks) {
          if (!chunk.citation) continue
          state.entries.set(identity(dataset.id, file.id, chunk.id), chunk.citation)
          state.next = Math.max(state.next, chunk.citation.number + 1)
        }
      }
      if (agent) agents.set(agent, state)
    }
    for (const dataset of sources) for (const file of dataset.files) for (const chunk of file.chunks) {
      const key = identity(dataset.id, file.id, chunk.id)
      let citation = state.entries.get(key)
      if (!citation) { citation = { number: state.next++, url: '#ragflow-cite=' + randomUUID() }; state.entries.set(key, citation) }
      chunk.citation = citation
    }
  }
}
