import type { ResolvedConfig } from './config.ts'
import type { ToolDefinition, ToolRunContext } from './harness.ts'
import type { Dataset, McpPort } from './mcp.ts'
import type { Selection } from './scope.ts'
import { resolveSelection } from './scope.ts'
import { SOURCE_MARKER, type DatasetSource } from './sources.ts'
import { createCitationNumbering } from './citations.ts'

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown): string => typeof value === 'string' ? value : ''
const resultIdentity = new WeakMap<object, string>()
const identity = (dataset: string, file: string, chunk: string) => JSON.stringify([dataset, file, chunk])

export function normalizeRetrieved(raw: unknown, selected: readonly Dataset[], limit: number): { results: { dataset: string; file: string; content: string; score?: number; citation?: { number: number; url: string } }[]; sources: DatasetSource[]; total: number } {
  if (!record(raw) || !Array.isArray(raw.chunks)) throw new Error('RAGFlow 检索响应缺少 chunks。')
  const datasets = new Map(selected.map(item => [item.id, item]))
  const sources = new Map<string, DatasetSource>()
  const results: { dataset: string; file: string; content: string; score?: number; citation?: { number: number; url: string } }[] = []
  for (const entry of raw.chunks) {
    if (!record(entry)) throw new Error('RAGFlow 返回了无效分块。')
    const datasetId = string(entry.dataset_id || entry.kb_id)
    const fileId = string(entry.document_id)
    const chunkId = string(entry.id || entry.chunk_id)
    const content = string(entry.content_with_weight ?? entry.content)
    if (!datasetId || !fileId || !chunkId || !content.trim() || !datasets.has(datasetId)) {
      throw new Error('RAGFlow 分块缺少可核实的来源，或超出会话所选数据集；已拒绝返回。')
    }
    if (results.length >= limit) continue
    const dataset = datasets.get(datasetId)!
    const metadata = record(entry.document_metadata) ? entry.document_metadata : {}
    const fileName = string(entry.document_name || metadata.name || entry.document_keyword) || fileId
    let source = sources.get(datasetId)
    if (!source) { source = { provider: 'RAGFlow', id: datasetId, name: dataset.name, files: [] }; sources.set(datasetId, source) }
    let file = source.files.find(item => item.id === fileId)
    if (!file) { file = { id: fileId, name: fileName, chunks: [] }; source.files.push(file) }
    const index = Number.isSafeInteger(entry.chunk_index) && Number(entry.chunk_index) >= 0 ? Number(entry.chunk_index) : -1
    file.chunks.push({ id: chunkId, index, content })
    const score = typeof entry.similarity === 'number' && Number.isFinite(entry.similarity) ? entry.similarity : undefined
    const result = { dataset: dataset.name, file: fileName, content, ...(score === undefined ? {} : { score }) }
    resultIdentity.set(result, identity(datasetId, fileId, chunkId))
    results.push(result)
  }
  const pagination = record(raw.pagination) ? raw.pagination : {}
  const total = Number.isSafeInteger(pagination.total_chunks) && Number(pagination.total_chunks) >= results.length ? Number(pagination.total_chunks) : results.length
  return { results, sources: [...sources.values()], total }
}

export function createScopedTool(port: McpPort, config: ResolvedConfig,
  selectionFor: (exec: ToolRunContext) => Promise<Selection>, ownerFor: (exec: ToolRunContext) => import('./harness.ts').ScopeAgent | undefined): ToolDefinition {
  const numberCitations = createCitationNumbering(ownerFor)
  return {
    name: `${config.toolPrefix}_search`,
    description: 'Search only the RAGFlow datasets selected by the user for this conversation. The adapter sets dataset_ids itself; you cannot choose or expand this scope. Cite supported claims with the exact [number](url) in a returned result. Reuse citations for repeated evidence. Never invent a source or reveal technical IDs unless asked.',
    parameters: { type: 'object', properties: { question: { type: 'string', description: 'Search question' }, page: { type: 'integer', minimum: 1, maximum: 50, description: 'Page number, default 1' } }, required: ['question'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { results: { type: 'array', items: { type: 'object' } }, sources: { type: 'array', items: { type: 'object' } }, total: { type: 'integer' } }, required: ['results', 'sources', 'total'] },
      render(_args, value) {
        const response = value as ReturnType<typeof normalizeRetrieved>
        const lines = response.results.map(result => `${result.citation ? `[${result.citation.number}](${result.citation.url}) ` : ''}${result.dataset} / ${result.file}\n${result.content}`)
        return [{ type: 'text', text: lines.length ? lines.join('\n\n') : '所选 RAGFlow 数据集中没有匹配分块。' }, { type: 'text', text: SOURCE_MARKER + JSON.stringify(response.sources) }]
      },
    },
    timeoutMs: config.requestTimeoutMs,
    async execute(args, exec) {
      if (!exec.agent) throw new Error('RAGFlow 检索需要可核实的会话，已拒绝无会话调用。')
      if (!record(args) || typeof args.question !== 'string' || !args.question.trim() || args.question.length > 10_000) throw new Error('RAGFlow 检索问题无效。')
      const page = args.page ?? 1
      if (!Number.isSafeInteger(page) || Number(page) < 1 || Number(page) > 50) throw new Error('RAGFlow 检索页码无效。')
      const datasets = await port.listDatasets(exec.signal)
      const selected = resolveSelection(await selectionFor(exec), datasets, config)
      // This is the only invocation of the native retrieval tool. Supplied dataset_ids
      // and document_ids are ignored; an empty array is never sent.
      const raw = await port.retrieve({ question: args.question.trim(), dataset_ids: selected.map(item => item.id), page: Number(page), page_size: config.maxResults }, exec.signal)
      const value = normalizeRetrieved(raw, selected, config.maxResults)
      numberCitations(value.sources, exec)
      const citations = new Map<string, { number: number; url: string }>()
      for (const source of value.sources) for (const file of source.files) for (const chunk of file.chunks) {
        if (chunk.citation) citations.set(identity(source.id, file.id, chunk.id), chunk.citation)
      }
      for (const result of value.results) {
        const key = resultIdentity.get(result)
        const citation = key ? citations.get(key) : undefined
        if (citation) result.citation = citation
      }
      return value
    },
  }
}
