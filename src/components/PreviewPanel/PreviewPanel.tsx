import { resolveAssetUrl, rewriteCopySmart } from '../../lib/edgeApi'
import { useProjectStore } from '../../store/useProjectStore'
import { useState } from 'react'

export function PreviewPanel() {
  const {
    previewTab,
    setPreviewTab,
    steps,
    rewriteVariants,
    selectedRewriteId,
    updateRewriteText,
    previewVideoUrl,
    previewComposed,
    addToast,
    extractedCopy,
    setRewriteVariants,
    updateCoverTitleText,
    selectCoverTitle,
    setSelectedRewrite,
  } = useProjectStore()
  const [regenerating, setRegenerating] = useState(false)
  const previewReady = steps.find((step) => step.id === 3)?.state === 'done' && previewComposed
  const activeRewrite = rewriteVariants.find((item) => item.id === selectedRewriteId)

  return (
    <aside className="preview-panel">
      <div className="preview-tabs">
        <button className={previewTab === 'preview' ? 'active' : ''} onClick={() => setPreviewTab('preview')}>
          预览
        </button>
        <button className={previewTab === 'copy' ? 'active' : ''} onClick={() => setPreviewTab('copy')}>
          文案
        </button>
      </div>

      <div className="preview-scroll">
        {previewTab === 'preview' && (
          <div className="tab-body">
            <p className="panel-kicker">结果预览</p>
            <div className="video-viewport">
              {previewVideoUrl ? (
                <video className="preview-video" src={resolveAssetUrl(previewVideoUrl)} controls playsInline />
              ) : (
                <span className="preview-empty">9:16 视频预览区</span>
              )}
            </div>
            <p className="muted preview-summary">
              文案摘要：这条视频将从用户需求、内容结构与转化动作三层，快速讲清爆款口播的执行路径...
            </p>
            {!previewComposed && (
              <div className="preview-ready-panel is-pending">
                <p className="preview-ready-title">请先在步骤 3 点击“添加标题和字幕并预览”。</p>
              </div>
            )}
            {previewReady && (
              <div className="preview-ready-panel is-ready">
                <p className="preview-ready-title">预览已生成。请播放检查画面、标题和字幕后保存成片。</p>
              </div>
            )}
          </div>
        )}

        {previewTab === 'copy' && (
          <div className="tab-body">
            <p className="panel-kicker">当前改写版本</p>
            <textarea
              className="copy-textarea"
              value={activeRewrite?.fullText ?? ''}
              onChange={(e) => updateRewriteText(e.target.value)}
            />
            <p className="hint">字数：{(activeRewrite?.fullText.length ?? 0).toLocaleString()}</p>
            <div className="row">
              <button
                className="btn-secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(activeRewrite?.fullText ?? '')
                    addToast({ type: 'success', message: '文案已复制到剪贴板' })
                  } catch {
                    addToast({ type: 'error', message: '复制失败，请手动复制' })
                  }
                }}
              >
                复制文案
              </button>
              <button
                className="btn-secondary"
                disabled={regenerating}
                onClick={async () => {
                  if (!extractedCopy.trim()) {
                    addToast({ type: 'error', message: '请先提取原文，再进行重新改写' })
                    return
                  }
                  try {
                    setRegenerating(true)
                    addToast({ type: 'loading', message: '正在重新调用 AI 改写...' })
                    const rewritten = await rewriteCopySmart(extractedCopy)
                    setRewriteVariants([
                      {
                        id: 'A',
                        name: 'AI 智能改写',
                        similarity: '结构重构',
                        preview: rewritten.rewrittenCopy.slice(0, 120),
                        fullText: rewritten.rewrittenCopy,
                      },
                      { id: 'B', name: '备用', similarity: '-', preview: '', fullText: '' },
                      { id: 'C', name: '备用', similarity: '-', preview: '', fullText: '' },
                    ])
                    const titles = rewritten.titleCandidates
                    if (titles[0]) updateCoverTitleText('A', titles[0])
                    if (titles[1]) updateCoverTitleText('B', titles[1])
                    if (titles[2]) updateCoverTitleText('C', titles[2])
                    if (titles[0]) selectCoverTitle('A')
                    setSelectedRewrite('A')
                    addToast({ type: 'success', message: '重新改写完成' })
                  } catch (error) {
                    const message = error instanceof Error ? error.message : '重新改写失败'
                    addToast({ type: 'error', message })
                  } finally {
                    setRegenerating(false)
                  }
                }}
              >
                {regenerating ? '改写中...' : '重新改写'}
              </button>
            </div>
          </div>
        )}

      </div>
    </aside>
  )
}
