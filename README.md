# 复刻 X 博士口播智能体

## 架构说明

- **云端**：账号登录（`/api/client/login`）、`/api/v1/*` 业务 API（详见仓库根目录 `API_V1_使用与调度说明.md`）。令牌由服务端签发，前端本地仅存 Bearer。
- **本机 8787**：仅用于 **`POST /api/workflow/extract`**（Python 文案提取）与 **`/user-data` 静态文件**。不参与鉴权，也不是 Edge 网关。
- **开发代理**：`vite.config.ts` 将 **`/api`、`/dl`** 转发到 `VITE_CLOUD_API_BASE_URL`，将 **`/api/workflow`、`/user-data`** 转发到 `http://localhost:8787`。

是否「需要一层 8787」：**不必**为云端接口单独准备中间层；8787 只为无法在浏览器内运行的本机脚本与静态资源保留。

## 本地启动

1. 复制 `.env.example` 为 `.env`，填写 **`VITE_CLOUD_API_BASE_URL`**（你的服务器 `https://域名或IP`，勿带末尾 `/`）。
2. 双击 `start.bat`（会并行启动本机 8787 与前端）。
3. 前端：`http://localhost:5173`。

若未配置 `VITE_CLOUD_API_BASE_URL`，登录与 `/api/v1` 调用将无法通过代理到达云端。

## 登录

使用云端账号调用 **`POST /api/client/login`**（JSON：`username` / `password`）。成功后使用 **`Authorization: Bearer &lt;token&gt;`** 访问 **`/api/v1/me`、`/api/v1/usage`** 等接口。

## 视频文案提取

- 接口：`POST /api/workflow/extract`（走本机 8787）
- 依赖：`cookies.txt`、Python、`bin/ffmpeg.exe` 等（见原说明）

## 故障排查

- **404**：检查 `.env` 是否配置云端地址，以及本机 8787 是否已启动（用于 workflow）。
- **跨域**：开发阶段请求发往同源 `/api/*`，由 Vite 代理到云端，无需浏览器直连云端域名。
- **自签证书**：代理侧 `secure` 已按 `https` 目标处理；若仍有 TLS 问题，请在服务端使用合法证书或由运维配置信任链。
