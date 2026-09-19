export interface ChunkSource { id: string; index: number; content: string; citation?: { number: number; url: string } }
export interface FileSource { id: string; name: string; chunks: ChunkSource[]; url?: string }
export interface DatasetSource { provider: 'RAGFlow'; id: string; name: string; files: FileSource[] }
export const SOURCE_MARKER = 'RAGFlow knowledge sources v1\n'
const citationPattern = /^#ragflow-cite=[a-f0-9-]{36}$/
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

export function readSources(blocks: readonly { type: string; text?: string }[]): DatasetSource[] {
  const last = blocks.at(-1)
  if (last?.type !== 'text' || !last.text?.startsWith(SOURCE_MARKER)) return []
  try {
    const value: unknown = JSON.parse(last.text.slice(SOURCE_MARKER.length))
    if (!Array.isArray(value)) return []
    return value.flatMap(row => {
      if (!object(row) || row.provider !== 'RAGFlow' || typeof row.id !== 'string' || !row.id || typeof row.name !== 'string' || !Array.isArray(row.files)) return []
      const files: FileSource[] = row.files.flatMap(file => {
        if (!object(file) || typeof file.id !== 'string' || !file.id || typeof file.name !== 'string' || !Array.isArray(file.chunks)) return []
        // No file route is assumed. A future verified link can be added through a strict allowlist.
        const chunks: ChunkSource[] = file.chunks.flatMap(chunk => {
          if (!object(chunk) || typeof chunk.id !== 'string' || !chunk.id || !Number.isSafeInteger(chunk.index) || Number(chunk.index) < -1 || typeof chunk.content !== 'string' || !chunk.content.trim()) return []
          const source: ChunkSource = { id: chunk.id, index: Number(chunk.index), content: chunk.content }
          if (object(chunk.citation) && Number.isSafeInteger(chunk.citation.number) && Number(chunk.citation.number) > 0 && typeof chunk.citation.url === 'string' && citationPattern.test(chunk.citation.url)) {
            source.citation = { number: Number(chunk.citation.number), url: chunk.citation.url }
          }
          return [source]
        })
        return [{ id: file.id, name: file.name, chunks }]
      })
      return [{ provider: 'RAGFlow' as const, id: row.id, name: row.name, files }]
    })
  } catch { return [] }
}

export function mergeSources(...groups: readonly DatasetSource[][]): DatasetSource[] {
  const datasets = new Map<string, DatasetSource>()
  for (const source of groups.flat()) {
    const previous = datasets.get(source.id)
    const files = new Map<string, FileSource>()
    for (const file of [...previous?.files ?? [], ...source.files]) {
      const old = files.get(file.id)
      const chunks = new Map<string, ChunkSource>()
      for (const chunk of [...old?.chunks ?? [], ...file.chunks]) {
        const citation = chunks.get(chunk.id)?.citation ?? chunk.citation
        chunks.set(chunk.id, { ...chunks.get(chunk.id), ...chunk, ...(citation ? { citation } : {}) })
      }
      files.set(file.id, { ...file, chunks: [...chunks.values()] })
    }
    datasets.set(source.id, { ...source, files: [...files.values()] })
  }
  return [...datasets.values()]
}
