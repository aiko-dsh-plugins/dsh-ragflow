# Aiko DSH RAGFlow 知识源插件

此插件通过 RAGFlow 官方 MCP Streamable HTTP `/mcp` 接入数据集发现与原生检索。模型只看到 `ragflow_search` 适配工具，**看不到** RAGFlow 原生 MCP 工具；适配器每次都从会话的用户选择计算非空 `dataset_ids` 并显式传给 `ragflow_retrieval`。RAGFlow 省略或传空 `dataset_ids` 时会搜索全部可访问数据集，因此这里拒绝空范围和无法核实来源的响应。

## 工作台体验

与本地适配版 `@wxg-prc-cpg/dsh-weknora` 一起加载时，现有“知识源”弹层同时列出 WeKnora 知识库和 RAGFlow 数据集；RAGFlow 插件不注册第二个选择器。两个提供方保留各自的默认、全部已授权和显式多选范围。选择记录为 DSH 原生命令事件，按会话及连接指纹恢复；运行中的任务不能修改选择。子 Agent 继承根会话的范围。任一已选数据集被撤权后检索失败，不自动扩大到其他数据集。

WeKnora 仍调用其 REST/问答能力；RAGFlow 调用官方 `ragflow_list_datasets` 和 `ragflow_retrieval`。两者在同一轮共享引用编号。引用预览显示提供方、数据集、文件、命中分块和本次返回的原文。RAGFlow MCP 检索响应没有可核实的原文件 Web 路由，此版本不提供猜测的文件链接。引用指向 DSH 内的 `#ragflow-cite=` 预览；来源元数据随成功工具结果进入原生会话，刷新后由会话事件重建。

## 配置

将插件装入目标 profile，并在该 profile 的 `cordis.patch.yml` 配置连接：

```yaml
- id: ragflow
  config:
    mcpUrl: https://ragflow-mcp.example.com/mcp
    credentialRef: RAGFLOW_API_KEY
    datasetIds: []
    maxResults: 10
    requestTimeoutMs: 60000
```

`mcpUrl` 必须是无凭据、无查询参数的 HTTP(S) `/mcp` 地址。`credentialRef` 是 DSH 凭据引用名称，默认 `RAGFLOW_API_KEY`。通过 DSH 已有的凭据服务或设置界面保存该引用的值，切勿把密钥写入 patch；插件每次 MCP 操作重新解析凭据并作为 Bearer 头发送。自托管 MCP 模式在 MCP 服务端配置 RAGFlow API key，客户端引用可留空；若网关需要 Bearer 认证则设置该引用。RAGFlow 官方启动文档仍注明 host mode 不支持 Streamable HTTP，接入前应确认所运行版本与模式确实提供 `/mcp`。

`datasetIds` 是默认范围。空数组表示从 `ragflow_list_datasets` 当前返回的全部已授权数据集中显式组装 ID，绝不向检索发送空数组。显式选择在当前会话中覆盖默认值。API key 轮换会改变连接指纹，旧会话选择不会误用到新身份。

RAGFlow 的 `ragflow_list_datasets` 需要返回每个数据集的 `id`；若旧版本漏掉 `name`，界面用 ID 作标签。检索分块必须携带 `dataset_id`（或 `kb_id`）、`document_id`、分块 `id` 和原文。缺失这些分块字段，或返回了所选范围之外的分块，整个工具调用失败，不向模型返回那批内容。检索页大小由 `maxResults` 控制，模型不能传 `dataset_ids` 或 `document_ids`。

## 验证

```sh
npm install
npm run build
npm run typecheck
npm test
npm pack --dry-run
```

测试覆盖官方 Streamable HTTP JSON-RPC 往返、凭据头、数据集范围、越界和缺失来源隔离、撤权、会话命令重放、子 Agent、编号回放、跨提供方编号及 `run_code` 来源传递。MCP 协议测试使用本地假服务器，不构成真实 RAGFlow 实例验证。

## 接入共享环境前

1. 准备已授权的 RAGFlow `/mcp` 地址并确认 `ragflow_list_datasets` 和有实际分块的 `ragflow_retrieval` 可用。
2. 在目标 DSH profile 的凭据服务中设置 `RAGFLOW_API_KEY`（仅在 MCP 服务或网关要求客户端密钥时），配置 `mcpUrl` 与默认数据集范围。
3. 使用现有共享环境安装流程，在空闲窗口装入此包及已更新的 WeKnora 本地适配包；不要直接修改共享 Host。
4. 在真实会话中选取两个提供方的范围，验证检索请求的 `dataset_ids`、跨提供方编号、引用预览和刷新恢复。测试撤权后应失败且不扩大范围。

官方依据：[RAGFlow MCP 启动文档](https://github.com/infiniflow/ragflow/blob/main/docs/develop/mcp/launch_mcp_server.md)、[RAGFlow 官方 MCP 实现](https://github.com/infiniflow/ragflow/blob/main/mcp/server/server.py)。
