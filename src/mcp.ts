import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { ResolvedConfig } from './config.ts'

export interface Dataset { id: string; name: string; description: string }
export interface McpPort {
  listDatasets(signal: AbortSignal): Promise<Dataset[]>
  retrieve(args: { question: string; dataset_ids: string[]; page: number; page_size: number }, signal: AbortSignal): Promise<unknown>
}
function textResult(result: unknown): string {
  if (!result || typeof result !== 'object' || !('content' in result) || !Array.isArray(result.content)) throw new Error('RAGFlow MCP 未返回同步工具结果。')
  if ('isError' in result && result.isError) throw new Error('RAGFlow MCP 操作失败，请检查连接和数据集权限。')
  const texts = result.content.flatMap(item => item && typeof item === 'object' && 'type' in item && item.type === 'text' && 'text' in item && typeof item.text === 'string' ? [item.text] : [])
  if (!texts.length) throw new Error('RAGFlow MCP 未返回文本结果。')
  return texts.join('\n')
}

function datasetLines(raw: string): Dataset[] {
  if (!raw.trim()) return []
  let rows: unknown[]
  try {
    const parsed: unknown = JSON.parse(raw)
    rows = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    rows = raw.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line) as unknown)
  }
  return rows.map(row => {
    if (!row || typeof row !== 'object') throw new Error('RAGFlow 返回了无效的数据集目录。')
    const data = row as Record<string, unknown>
    if (typeof data.id !== 'string' || !data.id) throw new Error('RAGFlow 数据集缺少可验证的 ID。')
    return { id: data.id, name: typeof data.name === 'string' && data.name.trim() ? data.name : data.id, description: typeof data.description === 'string' ? data.description : '' }
  })
}

/** Only these two official MCP calls are reachable; the model never receives raw MCP tools. */
export function createMcpPort(config: ResolvedConfig, credentials: { resolve(ref: string): Promise<{ value: string } | undefined> }): McpPort {
  async function call(name: 'ragflow_list_datasets' | 'ragflow_retrieval', args: Record<string, unknown>, signal: AbortSignal): Promise<string> {
    const secret = await credentials.resolve(config.credentialRef)
    const headers = secret?.value ? { Authorization: `Bearer ${secret.value}` } : {}
    const transport = new StreamableHTTPClientTransport(new URL(config.mcpUrl), { requestInit: { headers } })
    const client = new Client({ name: 'dsh-ragflow', version: '0.1.0' })
    const timeout = AbortSignal.timeout(config.requestTimeoutMs)
    const combined = AbortSignal.any([signal, timeout])
    try {
      await client.connect(transport as Parameters<Client['connect']>[0], { signal: combined, timeout: config.requestTimeoutMs })
      const result = await client.callTool({ name, arguments: args }, undefined, { signal: combined, timeout: config.requestTimeoutMs })
      return textResult(result)
    } catch (error) {
      if (combined.aborted) throw new Error(timeout.aborted ? 'RAGFlow MCP 请求超时。' : 'RAGFlow MCP 请求已取消。')
      // SDK/HTTP errors can include server detail or echoed headers; never log or return a secret.
      if (error instanceof Error && error.message.startsWith('RAGFlow MCP ')) throw error
      throw new Error('RAGFlow MCP 连接或工具调用失败，请检查 /mcp 地址、服务模式和凭据。')
    } finally { await client.close().catch(() => undefined) }
  }
  return {
    async listDatasets(signal) {
      const rows: Dataset[] = []
      const seen = new Set<string>()
      for (let page = 1; page <= 100; page++) {
        const batch = datasetLines(await call('ragflow_list_datasets', { page, page_size: 100 }, signal))
        if (batch.some(row => seen.has(row.id))) throw new Error('RAGFlow 数据集分页重复，无法确认完整目录。')
        for (const row of batch) { seen.add(row.id); rows.push(row) }
        if (batch.length < 100) return rows
      }
      throw new Error('RAGFlow 数据集目录超过分页上限，已停止检索。')
    },
    async retrieve(args, signal) {
      const raw = await call('ragflow_retrieval', { ...args, document_ids: [] }, signal)
      try { return JSON.parse(raw) as unknown } catch { throw new Error('RAGFlow 检索返回了无效 JSON。') }
    },
  }
}
