import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_RUNNINGHUB_CONFIG = Object.freeze({
  baseUrl: 'https://www.runninghub.ai',
  apiKey: '',
  workflows: {
    asr: { workflowId: '', audioNodeId: '1', audioField: 'audio' },
    rewrite: { workflowId: '', textNodeId: '1', textField: 'text' },
    digitalHuman: {
      workflowId: '',
      videoNodeId: '1',
      videoField: 'file',
      audioNodeId: '7',
      audioField: 'audio',
      textNodeId: '24',
      textField: 'text',
    },
  },
})

const mergeWorkflows = (base, incoming = {}) => ({
  asr: { ...base.asr, ...(incoming.asr || {}) },
  rewrite: { ...base.rewrite, ...(incoming.rewrite || {}) },
  digitalHuman: { ...base.digitalHuman, ...(incoming.digitalHuman || {}) },
})

const normalize = (input = {}) => ({
  baseUrl: String(input.baseUrl || DEFAULT_RUNNINGHUB_CONFIG.baseUrl).trim().replace(/\/$/, ''),
  apiKey: String(input.apiKey || '').trim(),
  workflows: mergeWorkflows(DEFAULT_RUNNINGHUB_CONFIG.workflows, input.workflows),
})

const validate = (config) => {
  let parsed
  try {
    parsed = new URL(config.baseUrl)
  } catch {
    throw new Error('RunningHub Base URL 必须是有效的 HTTP(S) 地址')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('RunningHub Base URL 只支持 HTTP(S) 地址')
  }
  return config
}

export const createRunningHubConfigStore = ({ filePath, env = process.env }) => ({
  async load() {
    let saved = {}
    try {
      saved = JSON.parse(await readFile(filePath, 'utf8'))
    } catch {
      saved = {}
    }
    const merged = normalize(saved)
    if (env.RUNNINGHUB_API_KEY) merged.apiKey = String(env.RUNNINGHUB_API_KEY).trim()
    if (env.RUNNINGHUB_BASE_URL) merged.baseUrl = String(env.RUNNINGHUB_BASE_URL).trim().replace(/\/$/, '')
    return validate(merged)
  },

  async save(input) {
    let saved = {}
    try {
      saved = JSON.parse(await readFile(filePath, 'utf8'))
    } catch {
      saved = {}
    }
    const merged = normalize({
      ...saved,
      ...input,
      apiKey: String(input?.apiKey || '').trim() || saved.apiKey || '',
      workflows: mergeWorkflows(mergeWorkflows(DEFAULT_RUNNINGHUB_CONFIG.workflows, saved.workflows), input?.workflows),
    })
    validate(merged)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, `${JSON.stringify(merged, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    return merged
  },

  toPublic(config) {
    return {
      baseUrl: config.baseUrl,
      apiKeyConfigured: Boolean(config.apiKey),
      workflows: config.workflows,
    }
  },
})
