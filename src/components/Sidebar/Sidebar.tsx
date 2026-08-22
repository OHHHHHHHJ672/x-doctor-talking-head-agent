import { Plus, Settings } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'

export function Sidebar() {
  const {
    projects,
    activeProjectId,
    addProject,
    selectProject,
    toggleApiModal,
    isServerConnected,
    quota,
    authUser,
  } = useProjectStore()

  return (
    <aside className="sidebar">
      <header className="sidebar-top">
        <div className="brand">
          <div className="brand-dot" />
          <div>
            <p className="brand-title">AI Video Studio</p>
            <p className="brand-subtitle">口播视频工作台</p>
          </div>
        </div>
        <button className="icon-btn" onClick={() => toggleApiModal(true)} aria-label="API 配置">
          <Settings size={14} />
        </button>
      </header>

      <button className="new-project-btn" onClick={addProject}>
        <Plus size={14} />
        新建项目
      </button>

      <div className="project-wrap">
        <p className="project-header">最近项目</p>
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                className={`project-item ${project.id === activeProjectId ? 'active' : ''}`}
                onClick={() => selectProject(project.id)}
              >
                <span className={`state-dot ${project.state}`} />
                <span className="project-name">{project.name}</span>
                <span className="platform-stack">
                  {project.platforms.slice(0, 3).map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <footer className="server-footer" onClick={() => toggleApiModal(true)}>
        <div className="server-line">
          <span className={`server-dot ${isServerConnected ? 'ok' : 'bad'}`} />
          <span>{authUser ? `已登录 ${authUser.username}` : '未登录（点击登录）'}</span>
        </div>
        <p className="server-points">剩余 {quota?.remainingPoints.toLocaleString() ?? '--'} pts</p>
      </footer>
    </aside>
  )
}
