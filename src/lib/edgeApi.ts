/**
 * 云端 API 客户端：鉴权与业务请求走服务器（/api/client、/api/v1）。
 * 本机仅 /api/workflow/* 等由 Vite 代理到 localhost:8787。
 */
const TOKEN_KEY = 'xstudio.client.token'
const USER_KEY = 'xstudio.client.user'
const TOKEN_EXPIRES_AT_KEY = 'xstudio.client.token.expiresAt'
const MIN_SESSION_MS = 4 * 60 * 60 * 1000

const isAbsoluteUrl = (url: string) => /^https?:\/\//i.test(url)

const buildApiUrl = (url: string) => {
  if (isAbsoluteUrl(url)) return url
  return url.startsWith('/') ? url : `/${url}`
}

export interface AuthUser {
  id: string
  username: string
  role: string
}

interface RequestOptions {
  method?: string
  body?: unknown
  auth?: boolean
  /** 将 /api/v1 等规范信封 { ok, data } 或历史 { code, data } 解包为 data */
  envelope?: boolean
  /** BFF/代理类 { code:0, ... }，失败时 code!=0，成功时整段返回给调用方解析 */
  proxyStyle?: boolean
  headers?: Record<string, string>
}

const sanitizeUserMessage = (message: string) => {
  const text = String(message || '').trim()
  if (!text) return '请求失败，请稍后重试'
  return text
    .replace(/runninghub/gi, '服务')
    .replace(/minimax/gi, '服务')
    .replace(/faster-whisper/gi, '服务')
    .replace(/whisper/gi, '服务')
    .replace(/ffmpeg/gi, '处理组件')
    .replace(/comfyui/gi, '任务')
    .replace(/workflow/gi, '流程')
    .replace(/apikey|api key/gi, '凭证')
    .replace(/VITE_CLOUD_API_BASE_URL/gi, '服务地址')
}

const getErrorText = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== 'object') return fallback
  const o = payload as Record<string, unknown>
  const err = o.error
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    return sanitizeUserMessage(String(e.message ?? e.code ?? fallback))
  }
  return sanitizeUserMessage(String(o.msg ?? o.message ?? o.error ?? fallback))
}

const unwrapOneLevel = (payload: unknown): unknown => {
  if (!payload || typeof payload !== 'object') return payload
  const o = payload as Record<string, unknown>
  if ('ok' in o && o.ok === true && 'data' in o) return o.data
  if ('code' in o && Number(o.code) === 0 && 'data' in o) return o.data
  return payload
}

const assertOkEnvelope = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('服务返回空数据')
  }
  const o = payload as Record<string, unknown>
  if ('ok' in o && o.ok === false) {
    throw new Error(getErrorText(payload, '请求失败'))
  }
}

const extractAccessToken = (payload: unknown): string => {
  const inner = unwrapOneLevel(payload) as Record<string, unknown> | null
  const o = inner && typeof inner === 'object' ? inner : (payload as Record<string, unknown>)
  return String(o.access_token ?? o.accessToken ?? o.token ?? '')
}

const parseJwtExpMs = (token: string): number | null => {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = typeof atob === 'function' ? atob(b64) : ''
    const payload = JSON.parse(json) as Record<string, unknown>
    const exp = Number(payload.exp ?? 0)
    if (!Number.isFinite(exp) || exp <= 0) return null
    return exp * 1000
  } catch {
    return null
  }
}

const extractExpiresAtMs = (raw: unknown, token: string): number | null => {
  const payload = (unwrapOneLevel(raw) as Record<string, unknown>) || (raw as Record<string, unknown>)
  const expiresIn = Number(payload.expires_in ?? payload.expiresIn ?? 0)
  const minExpireAt = Date.now() + MIN_SESSION_MS
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    return Math.max(Date.now() + expiresIn * 1000, minExpireAt)
  }
  const jwtExpAt = parseJwtExpMs(token)
  if (jwtExpAt && Number.isFinite(jwtExpAt)) return Math.max(jwtExpAt, minExpireAt)
  return minExpireAt
}

export const getToken = () => {
  if (typeof window === 'undefined') return ''
  const expiresAtRaw = localStorage.getItem(TOKEN_EXPIRES_AT_KEY)
  const expiresAt = Number(expiresAtRaw ?? 0)
  if (Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() >= expiresAt) {
    clearSession()
    return ''
  }
  return localStorage.getItem(TOKEN_KEY) || ''
}

export const getSavedUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.id || !parsed?.username) return null
    return {
      id: String(parsed.id),
      username: String(parsed.username),
      role: String(parsed.role || 'user'),
    }
  } catch {
    return null
  }
}

export const saveSession = (token: string, user: AuthUser, expiresAtMs?: number | null) => {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  if (expiresAtMs && Number.isFinite(expiresAtMs)) {
    localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Math.round(expiresAtMs)))
  } else {
    localStorage.removeItem(TOKEN_EXPIRES_AT_KEY)
  }
}

export const clearSession = () => {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(TOKEN_EXPIRES_AT_KEY)
}

export const requestJson = async <T = unknown>(url: string, options: RequestOptions = {}): Promise<T> => {
  const headers: Record<string, string> = { ...(options.headers || {}) }
  let body: BodyInit | undefined

  if (options.body instanceof FormData) {
    body = options.body
  } else if (options.body !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
    body = JSON.stringify(options.body)
  }

  if (options.auth) {
    const token = getToken()
    if (!token) throw new Error('请先登录账号')
    headers.Authorization = `Bearer ${token}`
  }

  const rid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  headers['X-Request-Id'] = headers['X-Request-Id'] || rid
  headers.Accept = headers.Accept || 'application/json'

  const response = await fetch(buildApiUrl(url), {
    method: options.method || 'GET',
    headers,
    body,
  })

  const rawText = await response.text()
  let payload: unknown = {}
  if (rawText.trim()) {
    try {
      payload = JSON.parse(rawText) as unknown
    } catch {
      payload = {}
    }
  }

  if (!response.ok) {
    const fallback =
      response.status === 404
        ? '请求失败(404)：接口地址不可用，请联系管理员检查服务状态'
        : `请求失败(${response.status})`
    throw new Error(getErrorText(payload, fallback))
  }

  assertOkEnvelope(payload)

  if (options.envelope) {
    const data = unwrapOneLevel(payload) as T
    return data
  }

  if (options.proxyStyle) {
    const o = payload as Record<string, unknown>
    if ('code' in o && Number(o.code) !== 0) {
      throw new Error(sanitizeUserMessage(String(o.msg ?? o.message ?? '服务返回错误')))
    }
    return payload as T
  }

  return payload as T
}

const envPath = (key: string, fallback: string) => {
  const v = (import.meta.env as Record<string, string | undefined>)[key]
  return String(v ?? '').trim() || fallback
}

/** 文档 3.2：multipart 上传至 RunningHub 代理 */
const V1_RH_UPLOAD = '/api/v1/RH/upload'
const V1_RH_COMPOSE = '/api/v1/RH/compose'
const V1_RH_SYNC = '/api/v1/RH/sync'

const RH_DH_WORKFLOW_ID = envPath('VITE_RH_DH_WORKFLOW_ID', '2046420487177244674')
const RH_DH_VIDEO_NODE = envPath('VITE_RH_DH_VIDEO_NODE', '1')
const RH_DH_VIDEO_FIELD = envPath('VITE_RH_DH_VIDEO_FIELD', 'file')
const RH_DH_AUDIO_NODE = envPath('VITE_RH_DH_AUDIO_NODE', '7')
const RH_DH_AUDIO_FIELD = envPath('VITE_RH_DH_AUDIO_FIELD', 'audio')
const RH_DH_TEXT_NODE = envPath('VITE_RH_DH_TEXT_NODE', '24')
const RH_DH_TEXT_FIELD = envPath('VITE_RH_DH_TEXT_FIELD', 'text')

const taskIdFromPayload = (payload: unknown): string => {
  const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  return String(o.taskId ?? o.task_id ?? o.id ?? '').trim()
}

export const loginClient = async (username: string, password: string) => {
  const raw = await requestJson<unknown>('/api/client/login', {
    method: 'POST',
    body: { username, password },
  })
  const token = extractAccessToken(raw)
  if (!token) throw new Error('登录响应中未找到 access_token / token')
  const expiresAtMs = extractExpiresAtMs(raw, token)

  saveSession(token, { id: '', username, role: 'user' }, expiresAtMs)

  let user: AuthUser
  try {
    const me = await fetchMe()
    user = me.user
  } catch {
    user = { id: username, username, role: 'user' }
  }
  saveSession(token, user, expiresAtMs)
  return { token, user }
}

export const logoutClient = async () => {
  try {
    await requestJson('/api/client/logout', {
      method: 'POST',
      auth: true,
      envelope: true,
    })
  } catch {
    // ignore
  } finally {
    clearSession()
  }
}

export const fetchMe = async (): Promise<{ user: AuthUser }> => {
  const data = await requestJson<Record<string, unknown>>('/api/v1/me', {
    auth: true,
    envelope: true,
  })
  const u = (data.user as Record<string, unknown>) || data
  const user: AuthUser = {
    id: String(u.id ?? u.uid ?? `u-${u.username ?? 'user'}`),
    username: String(u.username ?? ''),
    role: String(u.role ?? 'user'),
  }
  return { user }
}

export interface QuotaPayload {
  remainingPoints: number
  usedPointsThisMonth: number
  videosGenerated: number
  videoCostPerItem: number
  audioCloneCount: number
  rewriteCount: number
}

const normalizeQuota = (raw: Record<string, unknown>) => ({
  remainingPoints: Number(
    raw.remainingPoints ??
      raw.edge_trial_remaining ??
      raw.remaining ??
      raw.points ??
      raw.dailyRemaining ??
      0,
  ),
  usedPointsThisMonth: Number(raw.usedPointsThisMonth ?? raw.usedPoints ?? 0),
  videosGenerated: Number(raw.videosGenerated ?? raw.videoCount ?? 0),
  videoCostPerItem: Number(raw.videoCostPerItem ?? raw.videoCost ?? 1),
  audioCloneCount: Number(raw.audioCloneCount ?? raw.audioCount ?? 0),
  rewriteCount: Number(raw.rewriteCount ?? raw.copyRewriteCount ?? 0),
})

export const fetchUsage = async () => {
  const data = await requestJson<Record<string, unknown>>('/api/v1/usage', {
    auth: true,
    envelope: true,
  })
  const quotaRaw = (data.quota as Record<string, unknown>) || data
  const username = String(data.username ?? '')
  return {
    username,
    quota: normalizeQuota(quotaRaw),
  }
}

/** 解析相对资源路径（如 /dl/...）为当前页面 origin，便于 <video>/<img> 走同源代理 */
export const resolveAssetUrl = (path: string) => {
  if (!path) return path
  if (isAbsoluteUrl(path)) return path
  if (typeof window === 'undefined') return path
  return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`
}

type UploadPayload = {
  id: string
  name: string
  fileRef?: string
  videoPath: string
  audioPath: string
  thumbnailPath: string
  createdAt: string
}

const mapUploadResponse = (payload: unknown): UploadPayload => {
  const data = (unwrapOneLevel(payload) as Record<string, unknown>) || (payload as Record<string, unknown>)
  return {
    id: String(data.id ?? data.file_id ?? data.file_ref ?? Date.now()),
    name: String(data.name ?? data.filename ?? 'upload'),
    fileRef: String(data.file_ref ?? data.fileRef ?? ''),
    videoPath: String(data.videoPath ?? data.video_url ?? data.url ?? ''),
    audioPath: String(data.audioPath ?? data.audio_url ?? data.url ?? ''),
    thumbnailPath: String(data.thumbnailPath ?? data.thumbnail_url ?? data.thumb ?? ''),
    createdAt: String(data.createdAt ?? new Date().toISOString()),
  }
}

export const uploadAvatar = (formData: FormData) =>
  requestJson<unknown>(V1_RH_UPLOAD, {
    method: 'POST',
    body: formData,
    auth: true,
    proxyStyle: true,
  }).then(mapUploadResponse)

export const uploadAudio = (formData: FormData) =>
  requestJson<unknown>(V1_RH_UPLOAD, {
    method: 'POST',
    body: formData,
    auth: true,
    proxyStyle: true,
  }).then(mapUploadResponse)

const uploadRhWithProgress = (
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<UploadPayload> =>
  new Promise((resolve, reject) => {
    const token = getToken()
    if (!token) {
      reject(new Error('请先登录账号'))
      return
    }
    const xhr = new XMLHttpRequest()
    xhr.open('POST', buildApiUrl(V1_RH_UPLOAD), true)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.setRequestHeader('X-Request-Id', typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))
    // 避免用户长时间无响应地等待：例如上游超时或服务异常
    xhr.timeout = 180_000

    xhr.upload.onprogress = (event) => {
      if (!onProgress) return
      if (!event.lengthComputable) return
      const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)))
      onProgress(percent)
    }

    xhr.onerror = () => reject(new Error('上传失败，请检查网络或稍后重试'))
    xhr.ontimeout = () => reject(new Error('上传超时，上游服务响应较慢，请稍后重试或重新提交'))
    xhr.onload = () => {
      let payload: unknown = {}
      try {
        payload = xhr.responseText ? JSON.parse(xhr.responseText) : {}
      } catch {
        payload = {}
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(getErrorText(payload, `请求失败(${xhr.status})`)))
        return
      }
      const o = payload as Record<string, unknown>
      if ('code' in o && Number(o.code) !== 0) {
        reject(new Error(String(o.msg ?? o.message ?? '上游返回错误')))
        return
      }
      onProgress?.(100)
      resolve(mapUploadResponse(payload))
    }

    xhr.send(formData)
  })

export const uploadAvatarWithProgress = (formData: FormData, onProgress?: (percent: number) => void) =>
  uploadRhWithProgress(formData, onProgress)

export const uploadAudioWithProgress = (formData: FormData, onProgress?: (percent: number) => void) =>
  uploadRhWithProgress(formData, onProgress)

export const submitDigitalHuman = async (payload: Record<string, unknown> = {}) => {
  const videoRef = String(payload.avatarVideoPath ?? payload.videoPath ?? '').trim()
  const audioRef = String(payload.audioPath ?? '').trim()
  const rewriteText = String(payload.rewriteText ?? payload.copyText ?? '').trim()

  if (!videoRef || !audioRef) {
    throw new Error('缺少视频/音频素材引用，请先上传成功后再提交')
  }

  const composePayload = {
    workflow_id: RH_DH_WORKFLOW_ID,
    instanceType: 'plus',
    node_info_list: [
      {
        nodeId: RH_DH_VIDEO_NODE,
        fieldName: RH_DH_VIDEO_FIELD,
        fieldValue: videoRef,
      },
      {
        nodeId: RH_DH_AUDIO_NODE,
        fieldName: RH_DH_AUDIO_FIELD,
        fieldValue: audioRef,
      },
      {
        nodeId: RH_DH_TEXT_NODE,
        fieldName: RH_DH_TEXT_FIELD,
        fieldValue: rewriteText || '请根据上传音视频素材生成数字人口播视频',
      },
    ],
  }

  const raw = await requestJson<unknown>(V1_RH_COMPOSE, {
    method: 'POST',
    body: composePayload,
    auth: true,
    proxyStyle: true,
  })
  const taskId = taskIdFromPayload(unwrapOneLevel(raw) ?? raw)
  if (!taskId) throw new Error('云端未返回 taskId，请核对 RunningHub 工作流与节点配置')
  return { taskId }
}

export const fetchDigitalHumanStatus = async (taskId: string) => {
  const raw = await requestJson<unknown>(V1_RH_SYNC, {
    method: 'POST',
    body: { task_id: taskId },
    auth: true,
    proxyStyle: true,
  })
  const row = (unwrapOneLevel(raw) as Record<string, unknown>) || (raw as Record<string, unknown>)
  const result = (row.result as Record<string, unknown>) || row
  const outputList = Array.isArray(result.results)
    ? (result.results as Array<Record<string, unknown>>)
    : Array.isArray(result.outputs)
      ? (result.outputs as Array<Record<string, unknown>>)
      : []
  const first = outputList[0] || {}
  const upstreamStatusRaw = String(result.status ?? result.taskStatus ?? result.state ?? '').trim()
  const rawStatus = upstreamStatusRaw.toLowerCase()
  const progressRaw = Number(result.progress ?? result.percent ?? (rawStatus === 'done' ? 100 : rawStatus === 'running' ? 65 : 0))
  const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, Math.round(progressRaw))) : 0
  const status =
    rawStatus === 'success' || rawStatus === 'completed' || rawStatus === 'done'
      ? 'done'
      : rawStatus === 'running' || rawStatus === 'processing'
        ? 'processing'
        : rawStatus === 'failed' || rawStatus === 'error'
          ? 'failed'
          : progress > 0
            ? 'processing'
            : 'queued'
  return {
    progress,
    status,
    upstreamStatus: upstreamStatusRaw || undefined,
    updatedAt: (result.updatedAt ?? result.updateTime) as string | undefined,
    videoPath: (first.url ?? first.fileUrl ?? first.resourceUrl ?? result.videoPath ?? result.video_url ?? result.fileUrl) as string | undefined,
  }
}

export const submitOutfitTask = (payload: Record<string, unknown>) =>
  requestJson<{ taskId: string }>(V1_RH_COMPOSE, {
    method: 'POST',
    body: payload,
    auth: true,
    proxyStyle: true,
  }).then((raw) => {
    const id = taskIdFromPayload(unwrapOneLevel(raw) ?? raw)
    if (!id) throw new Error('发布任务未返回 taskId')
    return { taskId: id }
  })

export const composeOutfitPreview = async (payload: Record<string, unknown>) => {
  const raw = await requestJson<unknown>(V1_RH_COMPOSE, {
    method: 'POST',
    body: payload,
    auth: true,
    proxyStyle: true,
  })
  const taskId = taskIdFromPayload(unwrapOneLevel(raw) ?? raw)
  if (!taskId) throw new Error('合成任务未返回 taskId')
  return { taskId }
}

export const fetchOutfitStatus = async (taskId: string) => {
  const raw = await requestJson<unknown>(V1_RH_SYNC, {
    method: 'POST',
    body: { task_id: taskId },
    auth: true,
    proxyStyle: true,
  })
  const row = (unwrapOneLevel(raw) as Record<string, unknown>) || (raw as Record<string, unknown>)
  const result = (row.result as Record<string, unknown>) || row
  const outputList = Array.isArray(result.results)
    ? (result.results as Array<Record<string, unknown>>)
    : Array.isArray(result.outputs)
      ? (result.outputs as Array<Record<string, unknown>>)
      : []
  const first = outputList[0] || {}
  const upstreamStatusRaw = String(result.status ?? result.taskStatus ?? result.state ?? '').trim()
  const rawStatus = upstreamStatusRaw.toLowerCase()
  const progressRaw = Number(result.progress ?? result.percent ?? (rawStatus === 'done' ? 100 : 0))
  const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, Math.round(progressRaw))) : 0
  const status =
    ['done', 'processing', 'queued', 'failed'].includes(rawStatus) ? rawStatus : progress >= 100 ? 'done' : progress > 0 ? 'processing' : 'queued'
  return {
    progress,
    status,
    upstreamStatus: upstreamStatusRaw || undefined,
    updatedAt: (result.updatedAt ?? result.updateTime) as string | undefined,
    videoPath: (first.url ?? first.fileUrl ?? first.resourceUrl ?? result.videoPath ?? result.video_url ?? result.previewVideoUrl ?? result.resultVideoUrl) as string | undefined,
  }
}

const REWRITE_SYSTEM_PROMPT = `你是中文短视频文案重构助手。请在保持核心观点/痛点/转化目标不变的前提下，重写为全新表达。

约束：
1) 目标长度约为原文 70%~130%（最多原文+300字）。
2) 避免与原文出现连续6个及以上相同汉字。
3) 禁止输出解释、思考过程、Markdown、代码块标记。
4) 只输出一个合法 JSON 对象。

输出 JSON 模板（字段名保持一致）：
{
  "skeleton": {
    "core_pain": "",
    "core_emotion": "",
    "core_view": "",
    "core_structure": "",
    "core_data": "",
    "core_conversion": "",
    "source_char_count": 0,
    "target_char_range": ""
  },
  "title_candidates": ["标题1", "标题2", "标题3"],
  "rewritten_copy": "这里放重写后的完整文案"
}`

type RewriteSmartResult = {
  rewrittenCopy: string
  titleCandidates: string[]
  skeletonRaw: string
}

const parseRewriteJson = (content: string): RewriteSmartResult => {
  const trimmed = content.trim()
  const cleaned = trimmed
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
    .trim()
  const maybeJson = cleaned
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const extractFirstJsonObject = (text: string) => {
    const start = text.indexOf('{')
    if (start < 0) return ''
    let depth = 0
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i]
      if (ch === '{') depth += 1
      if (ch === '}') {
        depth -= 1
        if (depth === 0) return text.slice(start, i + 1)
      }
    }
    return ''
  }

  const jsonCandidate = extractFirstJsonObject(maybeJson) || maybeJson
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(jsonCandidate) as Record<string, unknown>
  } catch {
    return {
      rewrittenCopy: cleaned || trimmed,
      titleCandidates: [],
      skeletonRaw: '',
    }
  }
  const rewrittenCopy = String(
    parsed.rewritten_copy ??
      parsed.rewrittenCopy ??
      parsed.copy ??
      parsed.content ??
      parsed.text ??
      parsed.文案 ??
      '',
  ).trim()
  const titleCandidates = Array.isArray(parsed.title_candidates)
    ? parsed.title_candidates.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3)
    : Array.isArray(parsed.titles)
      ? parsed.titles.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3)
    : []
  const skeleton = parsed.skeleton
  return {
    rewrittenCopy: rewrittenCopy || cleaned || trimmed,
    titleCandidates,
    skeletonRaw: skeleton ? JSON.stringify(skeleton, null, 2) : '',
  }
}

export const rewriteCopySmart = async (originalScript: string) => {
  const source = String(originalScript || '').trim()
  if (!source) throw new Error('请先提取原始文案再改写')
  const raw = await requestJson<unknown>('/api/v1/digital-human/ai/complete', {
    method: 'POST',
    auth: true,
    proxyStyle: true,
    body: {
      model: 'MiniMax-M2.5-highspeed',
      temperature: 0.8,
      messages: [
        { role: 'system', content: REWRITE_SYSTEM_PROMPT },
        { role: 'user', content: source },
      ],
    },
  })
  const data = (unwrapOneLevel(raw) as Record<string, unknown>) || (raw as Record<string, unknown>)
  const choices = (data.choices as Array<Record<string, unknown>>) || []
  const first = choices[0] || {}
  const message = (first.message as Record<string, unknown>) || {}
  const normalizeContent = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            const o = item as Record<string, unknown>
            return String(o.text ?? o.content ?? '')
          }
          return ''
        })
        .join('\n')
        .trim()
    }
    if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>
      return String(o.text ?? o.content ?? '')
    }
    return ''
  }
  const content = normalizeContent(message.content ?? data.content ?? data.text).trim()
  if (!content) throw new Error('AI 未返回改写结果，请重试')
  return parseRewriteJson(content)
}

export const extractCopyFromUrl = (url: string, platform: 'bilibili' | 'douyin' | 'unknown' = 'unknown') =>
  requestJson<{ ok: boolean; text?: string; code?: string; error?: string; platform?: string }>('/api/workflow/extract', {
    method: 'POST',
    body: { url, platform },
  })

export const extractCopyFromFile = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return requestJson<{ ok: boolean; text?: string; code?: string; error?: string; platform?: string }>(
    '/api/workflow/extract-file',
    {
      method: 'POST',
      body: formData,
    },
  )
}

export const convertAudioToMp3Local = async (file: File): Promise<File> => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch('/api/workflow/convert-audio', {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    let message = '本地音频转 mp3 失败'
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload?.error) message = payload.error
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }
  const blob = await response.blob()
  const contentDisposition = response.headers.get('content-disposition') || ''
  const m = contentDisposition.match(/filename="?([^"]+)"?/)
  const fileName = (m?.[1] || file.name.replace(/\.[^.]+$/, '') || 'converted') + '.mp3'
  return new File([blob], fileName, { type: 'audio/mpeg' })
}

export const prepareVideoForUploadLocal = async (file: File): Promise<File> => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch('/api/workflow/prepare-video', {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) {
    let message = '本地视频处理失败'
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload?.error) message = payload.error
    } catch {
      // ignore parse errors
    }
    throw new Error(message)
  }
  const blob = await response.blob()
  const contentDisposition = response.headers.get('content-disposition') || ''
  const m = contentDisposition.match(/filename="?([^"]+)"?/)
  const fileName = (m?.[1] || file.name.replace(/\.[^.]+$/, '') || 'prepared') + '.mp4'
  return new File([blob], fileName, { type: 'video/mp4' })
}

export const transcribeSubtitleFromVideoUrl = (url: string) =>
  requestJson<{ ok: boolean; text?: string; code?: string; error?: string }>('/api/workflow/transcribe-video-url', {
    method: 'POST',
    body: { url },
  })

export const burnPreviewVideoLocal = (payload: {
  videoUrl: string
  titleText: string
  subtitleText: string
  titleStyle: Record<string, unknown>
  subtitleStyle: Record<string, unknown>
}) =>
  requestJson<{ ok: boolean; videoPath?: string; code?: string; error?: string }>('/api/workflow/burn-preview', {
    method: 'POST',
    body: payload,
  })
