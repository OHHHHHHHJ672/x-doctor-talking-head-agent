import { openAsBlob } from 'node:fs'
import path from 'node:path'

const DEFAULT_BASE_URL = 'https://www.runninghub.ai'

export class RunningHubError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message)
    this.name = 'RunningHubError'
    this.status = status
    this.code = code
  }
}

const redact = (value, apiKey) => {
  const text = String(value || '')
  return apiKey ? text.split(apiKey).join('[REDACTED]') : text
}

const unwrapData = (payload) => {
  if (!payload || typeof payload !== 'object') return payload
  return payload.data ?? payload.result ?? payload
}

const outputRows = (payload) => {
  const data = unwrapData(payload)
  if (Array.isArray(data)) return data
  if (!data || typeof data !== 'object') return []
  for (const key of ['outputs', 'results', 'output']) {
    if (Array.isArray(data[key])) return data[key]
  }
  return []
}

export const normalizeOutputs = (payload) =>
  outputRows(payload)
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      url: String(item.fileUrl ?? item.url ?? item.resourceUrl ?? item.downloadUrl ?? ''),
      type: String(item.fileType ?? item.type ?? ''),
      text: String(item.text ?? item.content ?? item.value ?? ''),
    }))
    .filter((item) => item.url || item.text)

export const taskStateFromPayload = (payload) => {
  const code = Number(payload?.code)
  const data = unwrapData(payload)
  const status = String(data?.status ?? payload?.status ?? '').toLowerCase()
  if ([805, 806, 807].includes(code) || ['failed', 'error', 'canceled', 'cancelled'].includes(status)) return 'failed'
  if (normalizeOutputs(payload).length > 0 || ['done', 'success', 'completed', 'finished'].includes(status)) return 'done'
  return 'processing'
}

export class RunningHubClient {
  constructor({ apiKey, baseUrl = DEFAULT_BASE_URL, fetchImpl = globalThis.fetch, timeoutMs = 120_000 }) {
    if (!String(apiKey || '').trim()) throw new RunningHubError('请先配置 RunningHub API Key')
    if (typeof fetchImpl !== 'function') throw new RunningHubError('当前运行环境不支持网络请求')
    this.apiKey = String(apiKey).trim()
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/$/, '')
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
  }

  async request(pathname, init, { allowedCodes = [] } = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${pathname}`, { ...init, signal: controller.signal })
      const raw = await response.text()
      let payload = {}
      try {
        payload = raw ? JSON.parse(raw) : {}
      } catch {
        payload = { msg: raw.slice(0, 500) }
      }
      const providerCode = payload?.code
      const acceptedCodes = [0, 200, '0', '200', ...allowedCodes]
      if (!response.ok || (providerCode !== undefined && !acceptedCodes.includes(providerCode))) {
        const message = redact(payload?.msg ?? payload?.message ?? `RunningHub HTTP ${response.status}`, this.apiKey)
        throw new RunningHubError(message, { status: response.status, code: String(providerCode ?? '') })
      }
      return payload
    } catch (error) {
      if (error instanceof RunningHubError) throw error
      const message = error?.name === 'AbortError' ? 'RunningHub 请求超时' : `RunningHub 请求失败：${redact(error?.message, this.apiKey)}`
      throw new RunningHubError(message)
    } finally {
      clearTimeout(timer)
    }
  }

  async uploadBuffer(buffer, filename, contentType = 'application/octet-stream') {
    const body = new FormData()
    body.append('file', new Blob([buffer], { type: contentType }), filename)
    const payload = await this.request('/openapi/v2/media/upload/binary', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body,
    })
    const data = unwrapData(payload) || {}
    const fileRef = String(data.fileName ?? data.fileRef ?? data.filePath ?? payload.fileName ?? '')
    if (!fileRef) throw new RunningHubError('RunningHub 上传响应缺少文件引用')
    return fileRef
  }

  async uploadFile(filePath, contentType = 'application/octet-stream', filename = path.basename(filePath)) {
    const body = new FormData()
    const file = await openAsBlob(filePath, { type: contentType })
    body.append('file', file, filename)
    const payload = await this.request('/openapi/v2/media/upload/binary', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body,
    })
    const data = unwrapData(payload) || {}
    const fileRef = String(data.fileName ?? data.fileRef ?? data.filePath ?? payload.fileName ?? '')
    if (!fileRef) throw new RunningHubError('RunningHub 上传响应缺少文件引用')
    return fileRef
  }

  async createTask({ workflowId, nodeInfoList, instanceType }) {
    if (!String(workflowId || '').trim()) throw new RunningHubError('未配置对应的 RunningHub Workflow ID')
    const body = { apiKey: this.apiKey, workflowId: String(workflowId), nodeInfoList: nodeInfoList || [] }
    if (instanceType) body.instanceType = instanceType
    const payload = await this.request('/task/openapi/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = unwrapData(payload) || {}
    const taskId = String(data.taskId ?? data.task_id ?? payload.taskId ?? payload.task_id ?? '')
    if (!taskId) throw new RunningHubError('RunningHub 创建任务响应缺少 taskId')
    return taskId
  }

  async getOutputs(taskId) {
    return this.request(
      '/task/openapi/outputs',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: this.apiKey, taskId: String(taskId) }),
      },
      { allowedCodes: [804, '804', 805, '805', 806, '806', 807, '807'] },
    )
  }

  async inspectWorkflow(workflowId) {
    return this.request('/api/openapi/getJsonApiFormat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: this.apiKey, workflowId: String(workflowId) }),
    })
  }
}
