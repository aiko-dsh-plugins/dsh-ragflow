import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import { mergeSources, readSources, type DatasetSource } from '../sources.ts'

interface Evidence { turn: number; sources: DatasetSource[] }
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap { ragflowSources: Evidence }
}
export const sourceDefinition: ConversationNodeDefinition<Evidence> = {
  kind: 'ragflowSources',
  match(event) {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type !== 'tool/result' || event.data.message.content[0].isError) return null
    if (!readSources(event.data.message.content[0].content).length) return null
    return { id: String(event.data.turn), role: 'update' }
  },
  start(_context, match) {
    if (match.event.type !== 'turn/start') throw new Error('Sources require turn/start')
    return { turn: match.event.data.turn, sources: [] }
  },
  update(context, match) {
    if (match.event.type !== 'tool/result') return context.state
    return { ...context.state, sources: mergeSources(context.state.sources, readSources(match.event.data.message.content[0].content)) }
  },
  buildLocationData(context, scope) {
    if (scope !== 'turn' || !context.state?.sources.length) return null
    return { kind: 'turn', turn: context.state.turn, key: 'ragflowSources', value: context.state }
  },
}
export function selectSources(owner: TurnTailOwnerProps): Evidence | null {
  return owner.turn.status === 'closed' ? owner.turn.data.get('ragflowSources') ?? null : null
}
