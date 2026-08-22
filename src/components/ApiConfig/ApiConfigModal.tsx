import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchUsage, loginClient, logoutClient } from '../../lib/edgeApi'
import { useProjectStore } from '../../store/useProjectStore'

const REMEMBER_PWD_KEY = 'xstudio.client.rememberPwd'
const REMEMBER_USERNAME_KEY = 'xstudio.client.rememberUsername'
const REMEMBER_PASSWORD_KEY = 'xstudio.client.rememberPassword'

const normalizeQuota = (data: Record<string, unknown>) => ({
  remainingPoints: Number(
    data.remainingPoints ??
      data.edge_trial_remaining ??
      data.remaining ??
      data.points ??
      data.dailyRemaining ??
      0,
  ),
  usedPointsThisMonth: Number(data.usedPointsThisMonth ?? data.usedPoints ?? 0),
  videosGenerated: Number(data.videosGenerated ?? data.videoCount ?? 0),
  videoCostPerItem: Number(data.videoCostPerItem ?? data.videoCost ?? 1),
  audioCloneCount: Number(data.audioCloneCount ?? data.audioCount ?? 0),
  rewriteCount: Number(data.rewriteCount ?? data.copyRewriteCount ?? 0),
})

export function ApiConfigModal() {
  const toggleApiModal = useProjectStore((s) => s.toggleApiModal)
  const quota = useProjectStore((s) => s.quota)
  const quotaLoading = useProjectStore((s) => s.quotaLoading)
  const authUser = useProjectStore((s) => s.authUser)
  const isAuthenticated = useProjectStore((s) => s.isAuthenticated)
  const setAuthUser = useProjectStore((s) => s.setAuthUser)
  const addToast = useProjectStore((s) => s.addToast)
  const setQuota = useProjectStore((s) => s.setQuota)
  const setQuotaLoading = useProjectStore((s) => s.setQuotaLoading)

  const rememberedEnabled = typeof window !== 'undefined' && localStorage.getItem(REMEMBER_PWD_KEY) === '1'
  const rememberedUsername = typeof window !== 'undefined' ? localStorage.getItem(REMEMBER_USERNAME_KEY) || '' : ''
  const rememberedPassword = typeof window !== 'undefined' ? localStorage.getItem(REMEMBER_PASSWORD_KEY) || '' : ''
  const [username, setUsername] = useState(authUser?.username || rememberedUsername || '')
  const [password, setPassword] = useState(rememberedEnabled ? rememberedPassword : '')
  const [rememberPassword, setRememberPassword] = useState(rememberedEnabled)
  const [submitting, setSubmitting] = useState(false)

  const fetchQuota = async () => {
    if (!isAuthenticated) {
      setQuota(null)
      setQuotaLoading(false)
      return
    }
    setQuotaLoading(true)
    try {
      const usage = await fetchUsage()
      setQuota(normalizeQuota(usage.quota as unknown as Record<string, unknown>))
    } catch (error) {
      await logoutClient()
      setAuthUser(null)
      setQuota(null)
      const message = error instanceof Error ? error.message : '拉取配额失败'
      addToast({ type: 'error', message })
    } finally {
      setQuotaLoading(false)
    }
  }

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      addToast({ type: 'error', message: '请输入账号和密码' })
      return
    }
    setSubmitting(true)
    try {
      const data = await loginClient(username.trim(), password)
      setAuthUser(data.user)
      if (rememberPassword) {
        localStorage.setItem(REMEMBER_PWD_KEY, '1')
        localStorage.setItem(REMEMBER_USERNAME_KEY, username.trim())
        localStorage.setItem(REMEMBER_PASSWORD_KEY, password)
      } else {
        localStorage.setItem(REMEMBER_PWD_KEY, '0')
        localStorage.removeItem(REMEMBER_PASSWORD_KEY)
        localStorage.setItem(REMEMBER_USERNAME_KEY, username.trim())
      }
      addToast({ type: 'success', message: `登录成功：${data.user.username}` })
      await fetchQuota()
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败'
      addToast({ type: 'error', message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    await logoutClient()
    setAuthUser(null)
    addToast({ type: 'success', message: '已退出登录' })
    await fetchQuota()
  }

  useEffect(() => {
    void fetchQuota()
  }, [isAuthenticated])

  return (
    <div className="modal-mask" onClick={() => toggleApiModal(false)}>
      <section className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>账户中心</h3>
          <button className="icon-btn" onClick={() => toggleApiModal(false)} aria-label="关闭">
            <X size={14} />
          </button>
        </header>

        <div className="account-layout">
          <article className="account-user-card">
            {isAuthenticated && authUser ? (
              <>
                <div className="account-user-top">
                  <div className="user-avatar">AI</div>
                  <div>
                    <p className="api-name">{authUser.username}</p>
                    <p className="hint">角色：{authUser.role}</p>
                  </div>
                </div>
                <div className="line-sep" />
                <p>登录状态：<span className="mini-badge running">已登录</span></p>
                <p className="hint">当前账号已连接服务，可直接使用全部功能</p>
                <div className="line-sep" />
                <button className="text-link logout-btn" onClick={() => void handleLogout()}>
                  退出登录
                </button>
              </>
            ) : (
              <>
                <div className="account-user-top">
                  <div className="user-avatar">AI</div>
                  <div>
                    <p className="api-name">请先登录</p>
                    <p className="hint">使用云端账号（与 API 文档 /api/client/login 一致）</p>
                  </div>
                </div>
                <div className="line-sep" />
                <div className="row" style={{ marginBottom: 8 }}>
                  <input
                    className="input flex-1"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="账号"
                  />
                </div>
                <div className="row">
                  <input
                    className="input flex-1"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="密码"
                    type="password"
                  />
                </div>
                <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={rememberPassword}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setRememberPassword(checked)
                      if (!checked) {
                        localStorage.setItem(REMEMBER_PWD_KEY, '0')
                        localStorage.removeItem(REMEMBER_PASSWORD_KEY)
                      }
                    }}
                  />
                  记住密码（仅在当前浏览器保存）
                </label>
                <div className="line-sep" />
                <button className="btn-primary full" onClick={() => void handleLogin()} disabled={submitting}>
                  {submitting ? '登录中...' : '登录'}
                </button>
              </>
            )}
          </article>

          <div className="account-usage">
            {!isAuthenticated ? (
              <div className="quota-grid">
                <article className="quota-card" style={{ gridColumn: '1 / -1' }}>
                  <p className="hint">请先登录后查看积分与统计数据</p>
                  <p className="quota-main">--</p>
                  <p className="hint">未登录状态不展示配额</p>
                </article>
              </div>
            ) : quotaLoading || !quota ? (
              <div className="quota-skeleton-grid">
                {[1, 2, 3, 4].map((n) => (
                  <div className="quota-skeleton" key={n} />
                ))}
              </div>
            ) : (
              <div className="quota-grid">
                <article className="quota-card">
                  <p className="hint">剩余点数</p>
                  <p className="quota-main">{quota.remainingPoints.toLocaleString()} pts</p>
                  <p className="hint">本月已用 {quota.usedPointsThisMonth.toLocaleString()}</p>
                </article>
                <article className="quota-card">
                  <p className="hint">视频生成</p>
                  <p className="quota-main">{quota.videosGenerated.toLocaleString()} 条</p>
                  <p className="hint">每条消耗 {quota.videoCostPerItem} 点</p>
                </article>
                <article className="quota-card">
                  <p className="hint">音频克隆</p>
                  <p className="quota-main">{quota.audioCloneCount.toLocaleString()} 次</p>
                  <p className="hint">本月累计使用次数</p>
                </article>
                <article className="quota-card">
                  <p className="hint">文案改写</p>
                  <p className="quota-main">{quota.rewriteCount.toLocaleString()} 篇</p>
                  <p className="hint">本月累计改写篇数</p>
                </article>
              </div>
            )}

            <p className="hint account-note">点数不足时请联系管理员充值</p>
            <button className="btn-secondary refresh-btn" onClick={() => void fetchQuota()}>
              刷新数据
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
