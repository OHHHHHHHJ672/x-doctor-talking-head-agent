# RunningHub 工作流说明

## 内置数字人预设

开源版本固定使用以下已验证预设，普通用户不需要编辑 Workflow ID 或节点：

| 输入 | Workflow ID | 节点 ID | fieldName |
|---|---:|---:|---|
| 参考声音 | 2091491962556866562 | 37 | audio |
| 人物视频 | 2091491962556866562 | 40 | video |
| 口播文本 | 2091491962556866562 | 58 | text |

工作流应返回至少一个可下载的视频 URL，推荐 MP4。软件通过 RunningHub OpenAPI 获取任务输出，并把第一个视频结果显示在预览区。

“测试连接”会调用 getJsonApiFormat 检查 API Key 是否能够访问该工作流，但不会创建生成任务，也不会产生数字人推理费用。真正点击“提交至 RunningHub 生成视频”后才会创建任务。

## 可选视频转写工作流

只有使用“视频转写（可选）”时才需要配置。默认输入契约：

| 项目 | 默认值 |
|---|---|
| 音频节点 ID | 1 |
| 输入字段 | audio |
| 输入内容 | RunningHub 上传接口返回的文件引用 |

输出可以是：

- 直接文本
- 包含 text、content、value 或 result 的 JSON
- 指向 UTF-8 文本/JSON 文件的 URL

## 可选文案改写工作流

默认输入契约：

| 项目 | 默认值 |
|---|---|
| 文本节点 ID | 1 |
| 输入字段 | text |
| 输入内容 | 完整转写原文 |

输出可以是直接文本，也可以是包含 text、content、value 或 result 的 JSON。没有配置改写工作流时，软件会继续使用转写原文。

## 使用的 OpenAPI

- POST /openapi/v2/media/upload/binary
- POST /task/openapi/create
- POST /task/openapi/outputs
- POST /api/openapi/getJsonApiFormat

RunningHub 上游接口可能调整，请以其当前官方文档为准。

## 故障定位

- “工作流不存在/无权限”：确认当前 API Key 对内置工作流有 OpenAPI 访问权限
- “节点不存在”：确认工作流仍包含节点 37、40、58
- “任务没有返回视频”：在 RunningHub 控制台检查工作流最终输出节点
- 返回 804：任务仍在排队或处理中，软件会继续轮询
- 返回 805/806/807：任务失败，请查看 RunningHub 控制台的节点错误

不要把 API Key、账户 Cookie 或私有工作流导出文件提交到仓库。
