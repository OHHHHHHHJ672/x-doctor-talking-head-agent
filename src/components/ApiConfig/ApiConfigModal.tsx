import { CheckCircle2, CircleHelp, Server, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  fetchRunningHubConfig,
  saveRunningHubConfig,
  testRunningHubConnection,
  type RunningHubPublicConfig,
} from '../../lib/edgeApi'
import { useProjectStore } from '../../store/useProjectStore'

const emptyWorkflows = {
  asr: { workflowId: '' },
  rewrite: { workflowId: '' },
  digitalHuman: {
    workflowId: '2091491962556866562',
    videoNodeId: '40',
    audioNodeId: '37',
    textNodeId: '58',
  },
}

export function ApiConfigModal() {
  const toggleApiModal = useProjectStore((state) => state.toggleApiModal)
  const setServerConnected = useProjectStore((state) => state.setServerConnected)
  const addToast = useProjectStore((state) => state.addToast)
  const [baseUrl, setBaseUrl] = useState('https://www.runninghub.ai')
  const [apiKey, setApiKey] = useState('')
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false)
  const [workflows, setWorkflows] = useState(emptyWorkflows)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    let active = true
    void fetchRunningHubConfig()
      .then((config) => {
        if (!active) return
        setBaseUrl(config.baseUrl)
        setApiKeyConfigured(config.apiKeyConfigured)
        setWorkflows({
          asr: { workflowId: config.workflows.asr.workflowId },
          rewrite: { workflowId: config.workflows.rewrite.workflowId },
          digitalHuman: {
            workflowId: config.workflows.digitalHuman.workflowId,
            videoNodeId: config.workflows.digitalHuman.videoNodeId,
            audioNodeId: config.workflows.digitalHuman.audioNodeId,
            textNodeId: config.workflows.digitalHuman.textNodeId,
          },
        })
        setServerConnected(config.readiness.coreReady)
      })
      .catch((error) => {
        addToast({ type: 'error', message: error instanceof Error ? error.message : '读取 RunningHub 设置失败' })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [addToast, setServerConnected])

  const updateWorkflow = (name: 'asr' | 'rewrite', workflowId: string) => {
    setWorkflows((current) => ({ ...current, [name]: { workflowId } }))
  }

  const applySavedConfig = (config: RunningHubPublicConfig) => {
    setApiKey('')
    setApiKeyConfigured(config.apiKeyConfigured)
    setServerConnected(config.readiness.coreReady)
  }

  const save = async () => {
    setSaving(true)
    try {
      const config = await saveRunningHubConfig({ baseUrl, apiKey, workflows })
      applySavedConfig(config)
      addToast({ type: 'success', message: 'RunningHub 设置已保存到本机' })
    } catch (error) {
      addToast({ type: 'error', message: error instanceof Error ? error.message : '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    setTesting(true)
    try {
      const config = await saveRunningHubConfig({ baseUrl, apiKey, workflows })
      applySavedConfig(config)
      const result = await testRunningHubConnection()
      setServerConnected(true)
      addToast({ type: 'success', message: result.message })
    } catch (error) {
      setServerConnected(false)
      addToast({ type: 'error', message: error instanceof Error ? error.message : '连接测试失败' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="modal-mask" onClick={() => toggleApiModal(false)}>
      <section className="modal-card runninghub-modal" aria-labelledby="runninghub-settings-title" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <h3 id="runninghub-settings-title">RunningHub 设置</h3>
            <p className="hint">数字人工作流已经内置，你只需要填写自己的 API Key</p>
          </div>
          <button className="icon-btn" onClick={() => toggleApiModal(false)} aria-label="关闭设置">
            <X size={14} />
          </button>
        </header>

        {loading ? (
          <div className="settings-loading" role="status">正在读取本机设置...</div>
        ) : (
          <div className="runninghub-settings">
            <div className="settings-status" role="status">
              {apiKeyConfigured ? <CheckCircle2 size={18} /> : <Server size={18} />}
              <div>
                <p className="api-name">{apiKeyConfigured ? 'API Key 已保存在本机' : '尚未配置 API Key'}</p>
                <p className="hint">已保存的 Key 不会回显到浏览器或写入仓库</p>
              </div>
            </div>

            <div className="preset-status">
              <ShieldCheck size={18} aria-hidden="true" />
              <div>
                <strong>数字人预设已就绪</strong>
                <p>Workflow 2091491962556866562 · 声音 37 · 视频 40 · 文本 58</p>
              </div>
            </div>

            <label className="settings-field">
              <span>RunningHub Base URL</span>
              <input className="input" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
            </label>
            <label className="settings-field">
              <span>RunningHub API Key</span>
              <input
                className="input"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={apiKeyConfigured ? '已保存；留空保持不变' : '请输入 RunningHub API Key'}
                autoComplete="off"
              />
            </label>

            <details className="optional-workflows">
              <summary><CircleHelp size={16} /> 可选：视频转写与文案改写</summary>
              <p className="hint">不配置也能直接粘贴文案并生成数字人。只有需要自动转写或自动改写时才填写。</p>
              <div className="workflow-settings" aria-label="可选工作流配置">
                <label className="settings-field">
                  <span>视频转写 Workflow ID</span>
                  <input className="input" value={workflows.asr.workflowId} onChange={(event) => updateWorkflow('asr', event.target.value)} placeholder="可留空" />
                </label>
                <label className="settings-field">
                  <span>文案改写 Workflow ID</span>
                  <input className="input" value={workflows.rewrite.workflowId} onChange={(event) => updateWorkflow('rewrite', event.target.value)} placeholder="可留空" />
                </label>
              </div>
            </details>

            <p className="hint settings-note">API Key 仅保存在当前 Windows 用户目录，浏览器和 Git 仓库都不会读取到明文。</p>
            <div className="settings-actions">
              <button className="btn-secondary" onClick={() => void testConnection()} disabled={saving || testing}>
                {testing ? '测试中...' : '测试连接'}
              </button>
              <button className="btn-primary" onClick={() => void save()} disabled={saving || testing || (!apiKeyConfigured && !apiKey)}>
                {saving ? '保存中...' : '保存设置'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
