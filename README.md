# X Doctor Talking-Head Agent

一套本地运行的短视频口播工作台：提取视频文案、AI 改写、上传参考音频和人物视频、生成数字人口播视频，并在本地完成标题与字幕预览。

AI 推理全部使用用户自己的 RunningHub API Key。本项目不包含共享账号、积分系统、自有中转服务器或本地 AI 模型。

## 功能

- 本地视频或 B 站/抖音链接的音频预处理
- RunningHub 语音转写工作流
- RunningHub 文案改写工作流
- RunningHub 数字人口播工作流
- 本地 FFmpeg 音视频格式转换
- 标题、字幕和封面预览

## 架构

```text
React :5173 -> 本机 Express :8787 -> RunningHub OpenAPI
                           -> FFmpeg / yt-dlp（本地媒体处理）
```

浏览器不会直接请求 RunningHub，也不会读取已保存的 API Key。Key 默认保存在被 Git 忽略的 `user-data/settings.json`，也可通过 `RUNNINGHUB_API_KEY` 环境变量注入。

## 环境要求

- Node.js 18+
- Python 3.10+
- FFmpeg/ffprobe 已加入 `PATH`
- 一个 RunningHub 账户和三个可通过 OpenAPI 调用的工作流

## 安装与启动

```powershell
npm install
python -m pip install -r requirements.txt
npm run dev:api
```

另开一个终端：

```powershell
npm run dev
```

Windows 也可以双击 `start.bat`，然后打开 `http://localhost:5173`。

首次启动会自动打开 RunningHub 设置。填写 API Key、语音转写 Workflow ID、文案改写 Workflow ID 和数字人口播 Workflow ID，然后点击“测试连接”。

## RunningHub 工作流

节点默认值和输出约定见 [workflows/README.md](workflows/README.md)。工作流 ID 属于用户自己的 RunningHub 账户，不应写入公开仓库。

## 数据与隐私

- API Key、临时上传文件和生成结果保存在本机 `user-data/`，该目录不会进入 Git。
- 视频与音频会按用户操作上传到 RunningHub。请阅读 RunningHub 的隐私和计费规则。
- 抖音/B 站下载功能要求用户自行提供合法登录状态；仓库不提供 Cookie。
- 请只处理你拥有授权的声音、肖像和视频素材。

## 测试

```powershell
npm test
npm run lint
npm run build
```

单元测试使用模拟 HTTP，不会创建付费 RunningHub 任务。

## 常见问题

- `未配置 Workflow ID`：在设置中填写自己复制后的工作流 ID。
- `FFmpeg missing`：安装 FFmpeg 并确认 `ffmpeg -version` 可运行。
- `804 / task is running`：任务仍在 RunningHub 排队或执行，客户端会继续轮询。
- 链接下载失败：更新 `yt-dlp`，并确认链接与登录状态合法有效。

## 贡献与安全

贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。不要在 Issue、日志或截图中粘贴 API Key。

## License

Copyright 2026. Licensed under the [Apache License 2.0](LICENSE).
