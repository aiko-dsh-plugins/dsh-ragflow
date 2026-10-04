# 验证记录 — 2026-09-19

## 范围与实现

- 后端使用 RAGFlow 官方 Streamable HTTP `/mcp`，只调用 `ragflow_list_datasets` 和 `ragflow_retrieval`；模型只看到带范围约束的 `ragflow_search`。
- 每次检索都根据根会话的选择或配置默认值生成非空 `dataset_ids`。撤权、空目录、响应越界或来源字段缺失均会使整次调用失败。
- 与 Aiko 版 WeKnora 同时加载时，共用一个知识源选择器；RAGFlow 来源、引用预览和会话恢复由本插件处理。
- Web 插槽已按 DSH `0.1.6-alpha.2` 的注册接口适配。

## 自动化检查

| 检查 | 结果 |
|---|---|
| `npm run build` | 通过 |
| `npm run typecheck` | 通过 |
| `npm test` | 13 项通过 |
| `npm pack --dry-run` | 通过；包内不含凭据和本地测试状态 |
| WeKnora `npm test` | 91 项通过 |

单元测试覆盖 MCP JSON-RPC 往返、凭据轮换、范围隔离、撤权、来源校验、会话命令重放、子 Agent、编号重放、跨提供方编号和 RPC。

## 真实 RAGFlow 与 DSH 验证

本机 RAGFlow `v0.27.2` 使用数据集 `Local Installation Test` 和文档 `ragflow-install-verification.txt`：

- REST、MCP 检索均命中校验值 `cedar-lantern-4827`。
- DSH 无界面 Agent 获得并调用 `ragflow_search`，真实检索证据进入模型上下文，最终回答包含校验值和引用。
- 隔离 DSH Web 验证统一选择器、显式数据集选择、回答、引用预览、数据集/文件/分块展示及刷新后恢复。
- 浏览器与 RPC 错误数为 0。

测试模型使用本地确定性 OpenAI 兼容服务以稳定触发工具调用；知识检索、范围限制、原文和引用来自真实 RAGFlow。

## 2026-09-23：零命中时保留已选知识源

用户界面同时选中两个知识源，但模型仅收到 WeKnora 的单库列表；RAGFlow 对测试查询返回零命中，旧输出未包含已选数据集名称。实际会话的两个工具都成功，模型随后把单通道列表计数作为会话总数。以已选 `Local Installation Test`、返回零分块的用例重现了信息缺失。

修复在 `selected_sources` 中返回本通道经过范围校验的名称，并在输出中说明这不是会话总数；零命中不能作为未选择、空库或没有业务资料的依据。引用 `sources` 仍只包含实际证据。新增两项回归修复前均失败，修复后连同范围隔离、撤权、子 Agent、历史引用及跨提供方编号共 12 项通过；TypeScript 构建通过。

实际桌面保留原 `0.1.2` 的范围默认值和前端，仅回移工具输出修复为 `0.1.2-aiko.1`，避免夹带独立开发中的未选择模式改动。安装包与原制品相比，运行文件仅 tools.js、tools.js.map 和 tools.d.ts 改变，另有版本与说明；旧文件已备份。安装后的同一复现用例通过。真实账号的 Electron 重启验证确认两个知识源名称可见、两个复选框选中、pageerror 为 0，同时统一账号下 3 个专家可读；没有向用户原会话发送新提示或改写历史回答。随后在独立测试会话中使用真实 DeepSeek Flash（high）发送原问题“现在我们有选择知识库吗”。模型实际调用 WeKnora 列表与 RAGFlow 检索，后者零命中且无引用，最终回答同时列出 `DSH 联调知识库` 和 `Local Installation Test`，明确合计 2 个，并说明零命中不代表未选择或空库。真实调用、最终文本和断言结果保存在桌面验证目录 `evidence/knowledge-real-model-result.json`。
