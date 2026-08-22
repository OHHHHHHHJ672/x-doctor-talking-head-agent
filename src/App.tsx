import { useEffect } from 'react'
import { ApiConfigModal } from './components/ApiConfig/ApiConfigModal'
import { PreviewPanel } from './components/PreviewPanel/PreviewPanel'
import { StepList } from './components/StepList/StepList'
import { ToastViewport } from './components/Toast/ToastViewport'
import { useProjectStore } from './store/useProjectStore'

function App() {
  const isApiModalOpen = useProjectStore((s) => s.isApiModalOpen)
  const isServerConnected = useProjectStore((s) => s.isServerConnected)
  const toggleApiModal = useProjectStore((s) => s.toggleApiModal)
  const projects = useProjectStore((s) => s.projects)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const activeProjectName = projects.find((item) => item.id === activeProjectId)?.name ?? '未命名项目'

  useEffect(() => {
    if (!isServerConnected) {
      toggleApiModal(true)
    }
  }, [isServerConnected, toggleApiModal])

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
                <p className="brand-title">短视频 · 超级 IP 智能体助手</p>
                <p className="brand-subtitle">本地客户端 · 云端一体 · 数字人口播工作台</p>
              </div>
            </div>
          </div>
          <div className="topbar-center">
            <p className="topbar-project-name">{activeProjectName}</p>
            <p className="topbar-project-subtitle">当前项目 · 文案 → 素材 → 字幕与封面</p>
          </div>
          <div className="topbar-right">
            <p className="topbar-user">RunningHub</p>
            <p className="topbar-points">{isServerConnected ? '连接正常' : '等待配置'}</p>
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
