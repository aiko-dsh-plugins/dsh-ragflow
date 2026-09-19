/** Scoped RAGFlow MCP adapter for DSH native Sessions. */
import { createHash } from 'node:crypto'
import { resolveConfig } from './config.ts'
import { createMcpPort } from './mcp.ts'
import { createScopedTool } from './tools.ts'
import { rootAgent, selectionForAgent, selectionFromEvents } from './scope.ts'
import type { HarnessContext, ScopeAgent } from './harness.ts'
// @ts-expect-error Optional web bridge is distributed as ESM JavaScript.
import { installWeb } from './web.mjs'

export const name = 'dsh-ragflow'
export const inject = ['tools', 'credentials'] as const
export { resolveConfig } from './config.ts'
export { createMcpPort } from './mcp.ts'
export { createScopedTool, normalizeRetrieved } from './tools.ts'

export function apply(ctx: HarnessContext, config: unknown): void {
  const resolved = resolveConfig(config)
  const port = createMcpPort(resolved, ctx.credentials)
  const command = `${resolved.toolPrefix}-scope`
  const deployment = async () => {
    const key = await ctx.credentials.resolve(resolved.credentialRef)
    return createHash('sha256').update(JSON.stringify([resolved.mcpUrl, resolved.credentialRef, key?.value ?? ''])).digest('hex')
  }
  let selection = async (agent: ScopeAgent) => selectionFromEvents(agent.session.snapshotEvents(), command, await deployment())
  let owner = (agent: ScopeAgent) => agent
  ctx.tools.register(createScopedTool(port, resolved, async exec => selection(exec.agent!), exec => exec.agent ? owner(exec.agent) : undefined))
  ctx.inject(['commands', 'agents', 'connection'], bridge => {
    const inherited = async (agent: ScopeAgent) => selectionForAgent(agent, bridge.agents, command, await deployment())
    bridge.effect(() => { selection = inherited; owner = agent => rootAgent(agent, bridge.agents); return () => { selection = async agent => selectionFromEvents(agent.session.snapshotEvents(), command, await deployment()); owner = agent => agent } })
    installWeb(bridge, { port, config: resolved, command, deployment, selection: inherited })
  })
  ctx.logger?.info(`dsh-ragflow: registered ${resolved.toolPrefix}_search against ${resolved.mcpUrl}`)
}
