import type { ScopeAgent, ScopeAgentRegistry, ScopeEvent } from './harness.ts'
import type { ResolvedConfig } from './config.ts'
import type { Dataset } from './mcp.ts'

export type Selection = { mode: 'default' | 'all' | 'selected'; ids: string[] }
export const DEFAULT_SELECTION: Selection = { mode: 'default', ids: [] }

export function parseSelection(value: unknown): Selection {
  if (!value || typeof value !== 'object') throw new Error('请选择 RAGFlow 数据集范围。')
  const row = value as Record<string, unknown>
  if (!['default', 'all', 'selected'].includes(String(row.mode)) || !Array.isArray(row.ids)
    || row.ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 200)) throw new Error('RAGFlow 数据集选择无效。')
  const ids = [...new Set(row.ids as string[])]
  if (row.mode === 'selected' && !ids.length) throw new Error('请至少选择一个 RAGFlow 数据集。')
  if (row.mode !== 'selected' && ids.length) throw new Error('默认或全部范围不能带数据集 ID。')
  return { mode: row.mode as Selection['mode'], ids }
}

export function selectionFromEvents(events: readonly ScopeEvent[], command: string, deployment: string): Selection {
  const pending = new Map<unknown, Record<string, unknown>>()
  let selection = DEFAULT_SELECTION
  for (const event of events) {
    if (event.type === 'command/run' && event.data.name === command) pending.set(event.data.commandId, event.data)
    if (event.type !== 'command/done') continue
    const input = pending.get(event.data.commandId)
    pending.delete(event.data.commandId)
    if (!input || event.data.kind !== 'success') continue
    try {
      const stored = JSON.parse(String(input.args)) as Record<string, unknown>
      if (stored.deployment === deployment) selection = parseSelection(stored)
    } catch { /* Ignore malformed historical commands. */ }
  }
  return selection
}

export function rootAgent(agent: ScopeAgent, registry: ScopeAgentRegistry): ScopeAgent {
  const live = registry.list()
  let owner = agent
  const seen = new Set<string>()
  while (!seen.has(owner.id)) {
    seen.add(owner.id)
    const parent = live.find(candidate => registry.isOwnedBy(owner.id, candidate))
    if (!parent) break
    owner = parent
  }
  return owner
}

export function selectionForAgent(agent: ScopeAgent, registry: ScopeAgentRegistry, command: string, deployment: string): Selection {
  return selectionFromEvents(rootAgent(agent, registry).session.snapshotEvents(), command, deployment)
}

/** Re-discovery on every operation detects revoked or renamed connections. */
export function resolveSelection(selection: Selection, datasets: readonly Dataset[], config: ResolvedConfig): Dataset[] {
  const ids = selection.mode === 'selected' ? selection.ids : selection.mode === 'default' && config.datasetIds.length ? config.datasetIds : datasets.map(row => row.id)
  if (ids.some(id => !datasets.some(row => row.id === id))) throw new Error('所选 RAGFlow 数据集已不可访问；请重新选择。')
  const resolved = datasets.filter(row => ids.includes(row.id))
  if (!resolved.length) throw new Error('当前没有可检索的已授权 RAGFlow 数据集。')
  return resolved
}
