import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_RUNNINGHUB_CONFIG = Object.freeze({
  baseUrl: 'https://www.runninghub.ai',
  apiKey: '',
  workflows: {
    asr: { workflowId: '', audioNodeId: '1', audioField: 'audio' },
    rewrite: { workflowId: '', textNodeId: '1', textField: 'text' },
    digitalHuman: {
      workflowId: '2091491962556866562',
      videoNodeId: '40',
      videoField: 'video',
      audioNodeId: '37',
      audioField: 'audio',
      textNodeId: '58',
      textField: 'text',
    },
  },
})

const mergeWorkflows = (base, incoming = {}) => ({
  asr: { ...base.asr, ...(incoming.asr || {}) },
  rewrite: { ...base.rewrite, ...(incoming.rewrite || {}) },
  digitalHuman: { ...DEFAULT_RUNNINGHUB_CONFIG.workflows.digitalHuman },
})

export const getWorkflowReadiness = (config) => ({
  coreReady: Boolean(config.apiKey && config.workflows.digitalHuman.workflowId),
  digitalHumanConfigured: Boolean(config.workflows.digitalHuman.workflowId),
  asrConfigured: Boolean(config.workflows.asr.workflowId),
  rewriteConfigured: Boolean(config.workflows.rewrite.workflowId),
})

export const getConfiguredWorkflowChecks = (config) => {
  const checks = [
    {
      key: 'digitalHuman',
      label: '数字人生成',
      workflowId: config.workflows.digitalHuman.workflowId,
      required: true,
    },
  ]
  if (config.workflows.asr.workflowId) {
    checks.push({
      key: 'asr',
      label: '视频转写（可选）',
      workflowId: config.workflows.asr.workflowId,
      required: false,
    })
  }
  if (config.workflows.rewrite.workflowId) {
    checks.push({
      key: 'rewrite',
      label: '文案改写（可选）',
      workflowId: config.workflows.rewrite.workflowId,
      required: false,
    })
  }
  return checks
}

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
      readiness: getWorkflowReadiness(config),
    }
  },
})
