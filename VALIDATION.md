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
