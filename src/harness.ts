export interface ScopeAgent {
  readonly id: string
  readonly session: { snapshotEvents(): ScopeEvent[] }
  readonly status?: string
}
export interface ScopeEvent { type: string; data: Record<string, unknown> }
export interface ScopeAgentRegistry {
  list(): ScopeAgent[]
  get(id: string): ScopeAgent | undefined
  isOwnedBy(id: string, owner: ScopeAgent): boolean
}
export interface ToolRunContext { readonly signal: AbortSignal; readonly agent?: ScopeAgent }
export interface JsonSchema { type?: string; properties?: Record<string, JsonSchema>; items?: JsonSchema; required?: string[]; additionalProperties?: boolean; description?: string; minimum?: number; maximum?: number }
export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: JsonSchema
  readonly output: { readonly schema: JsonSchema; render(args: unknown, value: unknown): { type: 'text'; text: string }[] }
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
  readonly timeoutMs?: number
}
export interface HarnessContext {
  readonly tools: { register(definition: ToolDefinition): () => void }
  readonly agents: ScopeAgentRegistry
  readonly credentials: { resolve(ref: string): Promise<{ value: string } | undefined> }
  readonly commands: { register(definition: unknown): () => void; execute(agent: ScopeAgent, command: string, attachments: unknown[], signal: AbortSignal): Promise<{ result: { kind: string; text?: string } } | undefined> }
  readonly connection: { rpc: { handle(path: string, handler: (method: string, payload: unknown) => Promise<unknown>): Promise<() => void> | (() => void) } }
  effect(callback: () => (() => void | Promise<void>)): unknown
  inject(names: string[], callback: (ctx: HarnessContext) => void): unknown
  on(event: string, callback: (...args: any[]) => unknown): unknown
  readonly logger?: { info(...args: unknown[]): void }
}
