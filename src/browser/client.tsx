import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { UseChat } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { DatasetSource, FileSource, ChunkSource } from '../sources.ts'
import { sourceDefinition, selectSources } from './projection.ts'

interface Reference { dataset: DatasetSource; file: FileSource; chunk: ChunkSource; number: number; url: string }
interface Preview { reference?: Reference; anchor: HTMLAnchorElement; pinned: boolean; left: number; top: number }
function references(sources: readonly DatasetSource[]): Reference[] {
  return sources.flatMap(dataset => dataset.files.flatMap(file => file.chunks.flatMap(chunk => chunk.citation
    ? [{ dataset, file, chunk, number: chunk.citation.number, url: chunk.citation.url }] : []))).sort((a, b) => a.number - b.number)
}
const css = `a[href*="#ragflow-cite="],.ragflow-reference-list a{display:inline-flex;align-items:center;gap:5px;font-size:12px;line-height:1.6;padding:0 6px;margin:0 2px;border-radius:5px;background:var(--ds-bg-secondary,#8096ae18);color:var(--ds-primary,#246ba5);text-decoration:none!important}a[href*="#ragflow-cite="]:hover,a[href*="#ragflow-cite="]:focus-visible{background:#528dcc28;outline:1px solid #528dcc66}.ragflow-reference-list{display:flex;gap:7px;flex-wrap:wrap}.ragflow-reference-list a{padding:4px 8px}.ragflow-preview{position:fixed;z-index:1000;width:min(400px,calc(100vw - 24px));max-height:min(440px,calc(100dvh - 24px));overflow:auto;border:1px solid #8396aa66;border-radius:12px;padding:16px;box-sizing:border-box;background:var(--ds-bg-primary,Canvas);color:var(--ds-text-primary,CanvasText);box-shadow:0 8px 32px #0003;font-size:13px;line-height:1.6;overflow-wrap:anywhere}.ragflow-preview header{display:flex;align-items:start;gap:12px;justify-content:space-between}.ragflow-preview button{font:inherit;cursor:pointer;border:0;background:transparent;color:inherit}.ragflow-preview blockquote,.ragflow-source blockquote{white-space:pre-wrap;margin:12px 0;border-left:2px solid #8096ae55;padding-left:12px;max-height:235px;overflow:auto}.ragflow-meta{opacity:.7;font-size:12px;margin-top:6px}.ragflow-sources{font-size:12px;margin:12px 0 16px}.ragflow-source{border:1px solid #8884;border-radius:10px;margin-top:8px;padding:12px}.ragflow-source details{margin-top:8px}.ragflow-source summary{cursor:pointer}.ragflow-source .ragflow-ids{opacity:.7;font-size:11px}`

function CitationLinks({ useChat, sessionId }: { useChat: UseChat; sessionId: string }) {
  const timeline = useChat(snapshot => snapshot.timeline)
  const live = useRef(timeline); live.current = timeline
  const [preview, setPreview] = useState<Preview>()
  const current = useRef(preview); current.current = preview
  const panel = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    setPreview(undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    const cancel = () => { if (timer) clearTimeout(timer) }
    const close = (restore = false) => { cancel(); if (restore) current.current?.anchor.focus({ preventScroll: true }); setPreview(undefined) }
    const link = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLAnchorElement>('a[href*="#ragflow-cite="]') : null
    const open = (anchor: HTMLAnchorElement, pinned: boolean) => {
      cancel()
      let reference: Reference | undefined
      for (const turn of live.current.turns.values()) {
        const evidence = turn.data.get('ragflowSources')
        reference = references(evidence?.sources ?? []).find(item => new URL(item.url, window.location.href).href === anchor.href)
        if (reference) break
      }
      const rect = anchor.getBoundingClientRect(), width = Math.min(400, window.innerWidth - 24), height = Math.min(440, window.innerHeight - 24)
      setPreview({ reference, anchor, pinned, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - height - 8) })
      if (pinned) requestAnimationFrame(() => closeButton.current?.focus({ preventScroll: true }))
    }
    const hover = (event: Event) => { if (current.current?.pinned) return; const anchor = link(event.target); if (anchor) open(anchor, false); else if (event.target instanceof Node && panel.current?.contains(event.target)) cancel() }
    const leave = (event: MouseEvent) => { if (current.current?.pinned) return; const target = event.relatedTarget; if (target instanceof Node && (panel.current?.contains(target) || link(target))) return; cancel(); timer = setTimeout(() => setPreview(undefined), 180) }
    const click = (event: MouseEvent) => { const anchor = link(event.target); if (anchor) { event.preventDefault(); event.stopPropagation(); open(anchor, true) } else if (event.target instanceof Node && !panel.current?.contains(event.target)) close() }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && current.current) { event.preventDefault(); close(true) } }
    const focusOut = (event: FocusEvent) => { if (!current.current) return; const target = event.relatedTarget; if (target instanceof Node && (panel.current?.contains(target) || link(target))) return; close() }
    const scroll = (event: Event) => { if (current.current?.pinned || event.target instanceof Node && panel.current?.contains(event.target)) return; if (current.current) close() }
    document.addEventListener('click', click, true); document.addEventListener('mouseover', hover); document.addEventListener('mouseout', leave); document.addEventListener('focusin', hover); document.addEventListener('focusout', focusOut); document.addEventListener('keydown', key); document.addEventListener('scroll', scroll, true)
    return () => { cancel(); document.removeEventListener('click', click, true); document.removeEventListener('mouseover', hover); document.removeEventListener('mouseout', leave); document.removeEventListener('focusin', hover); document.removeEventListener('focusout', focusOut); document.removeEventListener('keydown', key); document.removeEventListener('scroll', scroll, true) }
  }, [sessionId])
  const item = preview?.reference
  return <><style>{css}</style>{preview && <div ref={panel} className="ragflow-preview" role="dialog" aria-label={item ? `引用 ${item.number}` : '引用暂不可用'} style={{ left: preview.left, top: preview.top }}>
    <header><strong>{item ? `[${item.number}] ${item.file.name}` : '引用暂不可用'}</strong><button ref={closeButton} type="button" aria-label="关闭引用预览" onClick={() => { preview.anchor.focus({ preventScroll: true }); setPreview(undefined) }}>×</button></header>
    {item ? <><div className="ragflow-meta">知识源：{item.dataset.name} · 文件：{item.file.name} · {item.chunk.index >= 0 ? `分块 ${item.chunk.index + 1}` : '命中分块'}</div><blockquote>{item.chunk.content}</blockquote>{item.file.url && <a href={item.file.url} target="_blank" rel="noopener noreferrer">打开原文件 ↗</a>}</> : <p>当前会话尚未加载此引用的来源，不能确认其对应文件。请等待回答完成或刷新后重试。</p>}
  </div>}</>
}

function Listener({ sessionId, useChat }: PropsRuntime<'conversation.input.left'>) { return <CitationLinks sessionId={sessionId} useChat={useChat} /> }
function Sources({ matched }: { matched: { sources: DatasetSource[] } }) {
  const items = references(matched.sources)
  return <section className="ragflow-sources" aria-label="参考来源"><style>{css}</style><strong>参考来源</strong><div className="ragflow-reference-list">{items.map(item => <a key={item.url} href={item.url} aria-label={`查看引用 ${item.number}：${item.file.name}`}>[{item.number}] {item.file.name}</a>)}</div>
    <details><summary>查看知识源、文件和命中分块</summary>{matched.sources.map(dataset => <div className="ragflow-source" key={dataset.id}><strong>{dataset.name}</strong>{dataset.files.map(file => <details key={file.id}><summary>文件：{file.name} · {file.chunks.length} 个分块</summary>{file.chunks.map(chunk => <details key={chunk.id}><summary>{chunk.citation ? `[${chunk.citation.number}] ` : ''}{chunk.index >= 0 ? `分块 ${chunk.index + 1}` : '命中分块'}</summary><blockquote>{chunk.content}</blockquote></details>)}</details>)}</div>)}</details>
  </section>
}
export const inject = ['slots', 'uiConversation']
export function apply(ctx: Context) {
  ctx.effect(() => ctx.uiConversation.events.register(sourceDefinition))
  // The existing WeKnora composer remains the sole knowledge-source picker.
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'ragflow-citations', order: 26 }, Listener))
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({ name: 'conversation.chat.turnTail', id: 'ragflow-sources', order: 11 }, function TurnSources(props) {
    const matched = selectSources(props)
    return matched ? <Sources matched={matched} /> : null
  }))
}
