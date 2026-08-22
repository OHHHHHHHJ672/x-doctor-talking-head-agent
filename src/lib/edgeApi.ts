/** 本机 API 客户端。RunningHub API Key 仅由本机 Express 服务读取。 */

const isAbsoluteUrl = (url: string) => /^https?:\/\//i.test(url)

const buildApiUrl = (url: string) => {
  if (isAbsoluteUrl(url)) return url
  return url.startsWith('/') ? url : `/${url}`
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** 将 /api/v1 等规范信封 { ok, data } 或历史 { code, data } 解包为 data */
  envelope?: boolean
  /** BFF/代理类 { code:0, ... }，失败时 code!=0，成功时整段返回给调用方解析 */
  proxyStyle?: boolean
  headers?: Record<string, string>
}

const sanitizeUserMessage = (message: string) => {
  const text = String(message || '').trim()
  return text || '请求失败，请稍后重试'
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

export const requestJson = async <T = unknown>(url: string, options: RequestOptions = {}): Promise<T> => {
  const headers: Record<string, string> = { ...(options.headers || {}) }
  let body: BodyInit | undefined

  if (options.body instanceof FormData) {
    body = options.body
  } else if (options.body !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
    body = JSON.stringify(options.body)
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

/** 本机代理转发 RunningHub OpenAPI，浏览器不直接持有 API Key。 */
const V1_RH_UPLOAD = '/api/v1/RH/upload'
const V1_RH_SYNC = '/api/v1/RH/sync'

export interface RunningHubPublicConfig {
  baseUrl: string
  apiKeyConfigured: boolean
  workflows: {
    asr: { workflowId: string; audioNodeId: string; audioField: string }
    rewrite: { workflowId: string; textNodeId: string; textField: string }
    digitalHuman: {
      workflowId: string
      videoNodeId: string
      videoField: string
      audioNodeId: string
      audioField: string
      textNodeId: string
      textField: string
    }
  }
}

export const fetchRunningHubConfig = () =>
  requestJson<RunningHubPublicConfig>('/api/runninghub/config', { envelope: true })

export const saveRunningHubConfig = (input: {
  baseUrl: string
  apiKey?: string
  workflows: {
    asr: { workflowId: string }
    rewrite: { workflowId: string }
    digitalHuman: { workflowId: string }
  }
}) => requestJson<RunningHubPublicConfig>('/api/runninghub/config', { method: 'POST', body: input, envelope: true })

export const testRunningHubConnection = () =>
  requestJson<{ message?: string }>('/api/runninghub/test', { method: 'POST', envelope: true })

const taskIdFromPayload = (payload: unknown): string => {
  const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  return String(o.taskId ?? o.task_id ?? o.id ?? '').trim()
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
    proxyStyle: true,
  }).then(mapUploadResponse)

export const uploadAudio = (formData: FormData) =>
  requestJson<unknown>(V1_RH_UPLOAD, {
    method: 'POST',
    body: formData,
    proxyStyle: true,
  }).then(mapUploadResponse)

const uploadRhWithProgress = (
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<UploadPayload> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', buildApiUrl(V1_RH_UPLOAD), true)
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
      const payload: unknown = (() => {
        try {
          return xhr.responseText ? JSON.parse(xhr.responseText) : {}
        } catch {
          return {}
        }
      })()
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

  const raw = await requestJson<unknown>('/api/runninghub/digital-human', {
    method: 'POST',
    body: {
      videoRef,
      audioRef,
      text: rewriteText || '请根据上传音视频素材生成数字人口播视频',
      instanceType: 'plus',
    },
    envelope: true,
  })
  const taskId = taskIdFromPayload(unwrapOneLevel(raw) ?? raw)
  if (!taskId) throw new Error('云端未返回 taskId，请核对 RunningHub 工作流与节点配置')
  return { taskId }
}

export const fetchDigitalHumanStatus = async (taskId: string) => {
  const raw = await requestJson<unknown>(V1_RH_SYNC, {
    method: 'POST',
    body: { task_id: taskId },
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
  const parsed = (() => {
    try {
      return JSON.parse(jsonCandidate) as Record<string, unknown>
    } catch {
      return null
    }
  })()
  if (!parsed) {
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
  const raw = await requestJson<unknown>('/api/runninghub/rewrite', {
    method: 'POST',
    envelope: true,
    body: { text: `${REWRITE_SYSTEM_PROMPT}\n\n待改写文案：\n${source}` },
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
