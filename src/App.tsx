import { useEffect } from 'react'
import { ApiConfigModal } from './components/ApiConfig/ApiConfigModal'
import { PreviewPanel } from './components/PreviewPanel/PreviewPanel'
import { StepList } from './components/StepList/StepList'
import { ToastViewport } from './components/Toast/ToastViewport'
import { fetchRunningHubConfig } from './lib/edgeApi'
import { useProjectStore } from './store/useProjectStore'

function App() {
  const isApiModalOpen = useProjectStore((s) => s.isApiModalOpen)
  const isServerConnected = useProjectStore((s) => s.isServerConnected)
  const toggleApiModal = useProjectStore((s) => s.toggleApiModal)
  const setServerConnected = useProjectStore((s) => s.setServerConnected)
  const addToast = useProjectStore((s) => s.addToast)

  useEffect(() => {
    let active = true
    void fetchRunningHubConfig()
      .then((config) => {
        if (!active) return
        setServerConnected(config.readiness.coreReady)
        if (!config.readiness.coreReady) toggleApiModal(true)
      })
      .catch((error) => {
        if (!active) return
        toggleApiModal(true)
        addToast({ type: 'error', message: error instanceof Error ? error.message : '读取本机设置失败' })
      })
    return () => {
      active = false
    }
  }, [addToast, setServerConnected, toggleApiModal])

  return (
    <div className="app-root">
      <div className="desktop-guard">
        <h2>请放大窗口</h2>
        <p>当前工具仅支持桌面端，最小宽度为 960px。</p>
      </div>
      <div className="workbench-layout">
        <header className="topbar">
          <div className="topbar-left">
            <div className="brand">
              <div className="brand-dot" />
              <div>
                <p className="brand-title">X 博士数字人口播</p>
                <p className="brand-subtitle">本地素材处理 · RunningHub 数字人生成</p>
              </div>
            </div>
          </div>
          <div className="topbar-center">
            <h1 className="topbar-project-name">视频制作工作台</h1>
            <p className="topbar-project-subtitle">文案 → 声音与人物 → 字幕与导出</p>
          </div>
          <div className="topbar-right">
            <span className={`connection-pill ${isServerConnected ? 'is-ready' : ''}`}>
              {isServerConnected ? '数字人服务已就绪' : '需要 API Key'}
            </span>
            <button className="btn-secondary" onClick={() => toggleApiModal(true)}>
              RunningHub 设置
            </button>
          </div>
        </header>
        <section className="main-workspace">
          <StepList />
          <PreviewPanel />
        </section>
      </div>
      <ToastViewport />
      {isApiModalOpen && <ApiConfigModal />}
    </div>
  )
}

export default App
