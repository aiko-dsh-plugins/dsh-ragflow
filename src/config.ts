export interface Config {
  /** Official RAGFlow Streamable HTTP endpoint, ending in /mcp. */
  mcpUrl?: string
  /** Name in DSH's credential store; the secret itself is never configuration. */
  credentialRef?: string
  /** Default dataset scope; empty means all datasets currently returned by discovery. */
  datasetIds?: string[]
  toolPrefix?: string
  requestTimeoutMs?: number
  maxResults?: number
}
export interface ResolvedConfig {
  mcpUrl: string
  credentialRef: string
  datasetIds: string[]
  toolPrefix: string
  requestTimeoutMs: number
  maxResults: number
}

export function resolveConfig(input: unknown): ResolvedConfig {
  const row = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const url = new URL(String(row.mcpUrl ?? 'http://127.0.0.1:9382/mcp'))
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !/^\/mcp\/?$/.test(url.pathname)) {
    throw new Error('RAGFlow mcpUrl must be a credential-free HTTP(S) /mcp endpoint.')
  }
  const credentialRef = row.credentialRef ?? 'RAGFLOW_API_KEY'
  if (typeof credentialRef !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(credentialRef)) throw new Error('RAGFlow credentialRef must be a DSH credential name.')
  const datasetIds = row.datasetIds ?? []
  if (!Array.isArray(datasetIds) || datasetIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 200)) throw new Error('RAGFlow datasetIds must be nonempty strings.')
  const toolPrefix = row.toolPrefix ?? 'ragflow'
  if (typeof toolPrefix !== 'string' || !/^[a-z][a-z0-9_]*$/.test(toolPrefix)) throw new Error('RAGFlow toolPrefix is invalid.')
  const requestTimeoutMs = row.requestTimeoutMs ?? 60_000
  if (!Number.isSafeInteger(requestTimeoutMs) || Number(requestTimeoutMs) < 1000 || Number(requestTimeoutMs) > 300_000) throw new Error('RAGFlow requestTimeoutMs must be 1000–300000.')
  const maxResults = row.maxResults ?? 10
  if (!Number.isSafeInteger(maxResults) || Number(maxResults) < 1 || Number(maxResults) > 50) throw new Error('RAGFlow maxResults must be 1–50.')
  return { mcpUrl: url.toString().replace(/\/$/, ''), credentialRef, datasetIds: [...new Set(datasetIds as string[])], toolPrefix, requestTimeoutMs: Number(requestTimeoutMs), maxResults: Number(maxResults) }
}
