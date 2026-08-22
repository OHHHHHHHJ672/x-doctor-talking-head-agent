# RunningHub Workflows

本仓库不内置任何账户专属 Workflow ID。请在 RunningHub 中复制或创建工作流，再把自己的 ID 填入应用设置。

## 默认节点契约

| 能力 | 输入节点 | 字段 | 期望输出 |
|---|---:|---|---|
| 语音转写 | `1` | `audio` | 一个含转写文字的文本/JSON 输出 |
| 文案改写 | `1` | `text` | 文本或 JSON，推荐 `{ "rewritten_copy": "..." }` |
| 数字人视频 | `1` | `file` | 人物视频 |
| 数字人音频 | `7` | `audio` | 参考音频 |
| 数字人提示词 | `24` | `text` | 改写后文案 |

数字人工作流应输出 MP4。文本工作流可直接返回 `text/content/value`，也可返回一个文本文件 URL。

节点不同的用户可先保存设置，再编辑 `user-data/settings.json` 中的节点 ID 和字段名。不要提交这个文件。

## OpenAPI

客户端使用以下 RunningHub OpenAPI 能力：

- `POST /openapi/v2/media/upload/binary`
- `POST /task/openapi/create`
- `POST /task/openapi/outputs`
- `POST /api/openapi/getJsonApiFormat`

请以 RunningHub 当前官方文档为准；上游接口变化可能需要同步更新客户端。
