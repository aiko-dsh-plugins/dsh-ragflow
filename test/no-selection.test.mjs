import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionFromEvents, resolveSelection, parseSelection } from '../dist/scope.js';
import { createScopedTool } from '../dist/tools.js';
import { resolveConfig } from '../dist/config.js';

test('fresh sessions disable retrieval before contacting MCP', async () => {
  const selection = selectionFromEvents([], 'ragflow-scope', 'here');
  assert.deepEqual(selection, { mode: 'none', ids: [] });
  const config = resolveConfig({ datasetIds: ['a'] });
  assert.deepEqual(resolveSelection(selection, [{ id: 'a', name: 'A' }], config), []);
  assert.deepEqual(parseSelection(selection), selection);
  assert.throws(() => parseSelection({ mode: 'none', ids: ['a'] }));
  const tool = createScopedTool({ listDatasets() { assert.fail('must not contact MCP'); } }, config, async () => selection, exec => exec.agent);
  await assert.rejects(tool.execute({ question: 'test' }, { agent: { id: 'test' }, signal: new AbortController().signal }), /未选择知识源/);
});
