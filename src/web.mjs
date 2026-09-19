/** Host RPC bridge. The WeKnora composer consumes this optional provider state. */
import { parseSelection, resolveSelection } from './scope.js';
import { mergeSources, readSources, SOURCE_MARKER } from './sources.js';

export function installWeb(ctx, { port, config, command, deployment, selection }) {
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort());
  ctx.effect(() => ctx.commands.register({ name: command, description: '选择当前会话可检索的 RAGFlow 数据集', input: { hint: '数据集范围 JSON' },
    async handler({ agent, rawInput }) {
      if (agent.status !== 'idle') return { kind: 'error', text: '请等待当前任务结束后再切换知识源。' };
      try {
        const value = JSON.parse(rawInput);
        if (value.deployment !== await deployment()) throw new Error('RAGFlow 连接已变更，请刷新后重新选择。');
        const next = parseSelection(value);
        resolveSelection(next, await port.listDatasets(lifetime.signal), config);
        if (agent.status !== 'idle') throw new Error('会话已开始运行，请结束后再切换。');
        return { kind: 'success', text: 'RAGFlow 数据集范围已更新。' };
      } catch (error) { return { kind: 'error', text: error.message }; }
    },
  }));
  const pending = new Set();
  const dispatch = async (method, payload) => {
    try {
      if (!payload || typeof payload.sessionId !== 'string' || payload.sessionId.length > 200) throw new Error('无效的会话。');
      const agent = ctx.agents.get(payload.sessionId);
      if (!agent) throw new Error('请先打开会话。');
      if (method === 'select') {
        const next = parseSelection(payload.selection);
        const reply = await ctx.commands.execute(agent, `/${command} ${JSON.stringify({ ...next, deployment: await deployment() })}`, [], lifetime.signal);
        if (reply?.result.kind !== 'success') throw new Error(reply?.result.text ?? 'RAGFlow 数据集选择失败。');
      } else if (method !== 'state') throw new Error('未知 RAGFlow 操作。');
      const datasets = await port.listDatasets(lifetime.signal);
      const current = await selection(agent);
      let effective = [], scopeError = '';
      try { effective = resolveSelection(current, datasets, config); } catch (error) { scopeError = error.message; }
      let defaults = [];
      try { defaults = resolveSelection({ mode: 'default', ids: [] }, datasets, config); } catch { /* A broken default must not expand. */ }
      return { ok: true, value: { datasets, selection: current, effective, defaults, scopeError, busy: agent.status !== 'idle' } };
    } catch (error) { return { ok: false, error: { code: 'ragflow', message: error.message, details: {} } }; }
  };
  ctx.effect(() => {
    const dispose = ctx.connection.rpc.handle('/ragflow', (method, payload) => {
      const task = dispatch(method, payload); pending.add(task);
      void task.finally(() => pending.delete(task)); return task;
    });
    return async () => { lifetime.abort(); await dispose(); await Promise.allSettled([...pending]); };
  });

  const nested = new WeakMap();
  ctx.on('tools/result', (exec, result) => {
    if (!exec.agent) return;
    const key = exec.rootCallId ?? exec.callId;
    if (!exec.parent) { nested.get(exec.agent)?.delete(key); return; }
    if (result.isError || exec.name !== `${config.toolPrefix}_search`) return;
    const sources = readSources(result.content ?? []);
    if (!sources.length) return;
    let calls = nested.get(exec.agent);
    if (!calls) nested.set(exec.agent, calls = new Map());
    calls.set(key, mergeSources(calls.get(key) ?? [], sources));
  });
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    if (exec.parent || !exec.agent || result.isError || decision.kind !== 'accept' || 'value' in decision) return decision;
    const sources = nested.get(exec.agent)?.get(exec.rootCallId ?? exec.callId);
    if (!sources?.length) return decision;
    return { ...decision, content: [...decision.content ?? result.content, { type: 'text', text: SOURCE_MARKER + JSON.stringify(sources) }] };
  });
}
