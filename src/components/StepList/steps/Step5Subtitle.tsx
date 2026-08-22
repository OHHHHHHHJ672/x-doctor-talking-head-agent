import { useEffect, useRef, useState } from 'react'
import { burnPreviewVideoLocal, resolveAssetUrl, transcribeSubtitleFromVideoUrl } from '../../../lib/edgeApi'
import { useProjectStore } from '../../../store/useProjectStore'
import { CANVAS_H, CANVAS_W, renderCanvas } from './canvasRenderer'

export function Step5Subtitle() {
  const {
    setStepState,
    setCoverImage,
    setPreviewVideoUrl,
    setPreviewComposed,
    setPreviewTab,
    addToast,
    coverTitleVariants,
    selectedCoverTitleId,
    selectCoverTitle,
    updateCoverTitleText,
    coverTitle,
    coverStyle,
    updateCoverStyle,
    subtitleText,
    setSubtitleText,
    subtitleStyle,
    updateSubtitleStyle,
    avatars,
    selectedAvatarId,
    selectedRewriteId,
    rewriteVariants,
    previewVideoUrl,
  } = useProjectStore((s) => s)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pollRef = useRef<number | null>(null)
  const [composing, setComposing] = useState(false)
  const [composeStatus, setComposeStatus] = useState('待植入标题与字幕')
  const [subtitleLoading, setSubtitleLoading] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H
  }, [])

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [])

  useEffect(() => {
    if (composing) return
    setPreviewComposed(false)
    setStepState(3, 'running')
    setComposeStatus('参数已变更，请重新植入并预览')
  }, [coverTitle, coverStyle, subtitleStyle, subtitleText, selectedAvatarId, selectedRewriteId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const selectedAvatar = avatars.find((avatar) => avatar.id === selectedAvatarId)
    if (selectedAvatar) {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        renderCanvas(ctx, image, {
          titleText: coverTitle,
          subtitleText,
          titleStyle: coverStyle,
          subtitleStyle,
        })
      }
      image.src = resolveAssetUrl(selectedAvatar.thumbnailPath)
    } else {
      renderCanvas(ctx, null, {
        titleText: coverTitle,
        subtitleText,
        titleStyle: coverStyle,
        subtitleStyle,
      })
    }
  }, [coverTitle, coverStyle, subtitleStyle, subtitleText, avatars, selectedAvatarId])

  useEffect(() => {
    if (!previewVideoUrl || subtitleText.trim() || subtitleLoading) return
    setSubtitleLoading(true)
    void transcribeSubtitleFromVideoUrl(previewVideoUrl)
      .then((data) => {
        const text = String(data.text || '').trim()
        if (text) {
          setSubtitleText(text)
          addToast({ type: 'success', message: '已自动提取字幕，可继续编辑' })
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : '自动提取字幕失败'
        addToast({ type: 'error', message })
      })
      .finally(() => setSubtitleLoading(false))
  }, [previewVideoUrl, subtitleText, subtitleLoading, setSubtitleText, addToast])

  return (
    <div className="merged-step-layout">
      <div className="merged-left">
        <div className="group-title">字幕样式</div>
        <textarea
          className="input merged-textarea"
          value={subtitleText}
          onChange={(e) => setSubtitleText(e.target.value)}
          placeholder="编辑完整字幕内容..."
        />
        <div className="setting-row">
          <span>字号</span>
          <input
            className="input mini-input"
            type="number"
            min={12}
            max={48}
            value={subtitleStyle.fontSize}
            onChange={(e) =>
              updateSubtitleStyle({
                fontSize: Math.max(12, Math.min(Number(e.target.value), 48)),
              })
            }
          />
        </div>
        <div className="setting-row">
          <span>字幕颜色</span>
          <div className="pill-row">
            <button type="button" className={`pill ${subtitleStyle.fontColor === '#FFFFFF' ? 'active' : ''}`} onClick={() => updateSubtitleStyle({ fontColor: '#FFFFFF' })}>白</button>
            <button type="button" className={`pill ${subtitleStyle.fontColor === '#111827' ? 'active' : ''}`} onClick={() => updateSubtitleStyle({ fontColor: '#111827' })}>黑</button>
            <button type="button" className={`pill ${subtitleStyle.fontColor === '#FACC15' ? 'active' : ''}`} onClick={() => updateSubtitleStyle({ fontColor: '#FACC15' })}>黄</button>
          </div>
        </div>
        <div className="setting-row">
          <span>描边颜色</span>
          <div className="pill-row">
            <button type="button" className={`pill ${subtitleStyle.strokeColor === 'transparent' ? 'active' : ''}`} onClick={() => updateSubtitleStyle({ strokeColor: 'transparent', strokeWidth: 0 })}>无</button>
            <button type="button" className={`pill ${subtitleStyle.strokeColor === '#000000' ? 'active' : ''}`} onClick={() => updateSubtitleStyle({ strokeColor: '#000000', strokeWidth: Math.max(1, subtitleStyle.strokeWidth) })}>黑</button>
            <button type="button" className={`pill ${subtitleStyle.strokeColor === '#FFFFFF' ? 'active' : ''}`} onClick={() => updateSubtitleStyle({ strokeColor: '#FFFFFF', strokeWidth: Math.max(1, subtitleStyle.strokeWidth) })}>白</button>
          </div>
        </div>
        <div className="setting-row">
          <span>描边宽度</span>
          <input
            className="input mini-input"
            type="number"
            min={0}
            max={6}
            value={subtitleStyle.strokeWidth}
            onChange={(e) =>
              updateSubtitleStyle({
                strokeWidth: Math.max(0, Math.min(Number(e.target.value), 6)),
              })
            }
          />
        </div>
        <div className="setting-row">
          <span>字体粗细</span>
          <div className="pill-row">
            <button type="button" className={`pill ${!subtitleStyle.bold ? 'active' : ''}`} onClick={() => updateSubtitleStyle({ bold: false })}>常规</button>
            <button type="button" className={`pill ${subtitleStyle.bold ? 'active' : ''}`} onClick={() => updateSubtitleStyle({ bold: true })}>加粗</button>
          </div>
        </div>

        <div className="group-title">封面标题</div>
        <div className="cover-titles">
          {coverTitleVariants.map((plan) => (
            <label key={plan.id} className={`cover-title-row ${selectedCoverTitleId === plan.id ? 'selected' : ''}`}>
              <input type="radio" name="cover-title" checked={selectedCoverTitleId === plan.id} onChange={() => selectCoverTitle(plan.id)} />
              <input
                type="text"
                className="cover-title-input"
                value={plan.text}
                placeholder="输入自定义标题..."
                onFocus={() => selectCoverTitle(plan.id)}
                onChange={(e) => updateCoverTitleText(plan.id, e.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="setting-row">
          <span>标题字号</span>
          <input
            className="input mini-input"
            type="number"
            min={16}
            max={60}
            value={coverStyle.fontSize}
            onChange={(e) =>
              updateCoverStyle({
                fontSize: Math.max(16, Math.min(Number(e.target.value), 60)),
              })
            }
          />
        </div>
        <div className="setting-row">
          <span>标题颜色</span>
          <div className="pill-row">
            <button type="button" className={`pill ${coverStyle.fontColor === '#FFFFFF' ? 'active' : ''}`} onClick={() => updateCoverStyle({ fontColor: '#FFFFFF' })}>白</button>
            <button type="button" className={`pill ${coverStyle.fontColor === '#FACC15' ? 'active' : ''}`} onClick={() => updateCoverStyle({ fontColor: '#FACC15' })}>黄</button>
            <button type="button" className={`pill ${coverStyle.fontColor === '#EF4444' ? 'active' : ''}`} onClick={() => updateCoverStyle({ fontColor: '#EF4444' })}>红</button>
          </div>
        </div>
        <div className="setting-row">
          <span>标题描边</span>
          <div className="pill-row">
            <button type="button" className={`pill ${coverStyle.strokeColor === 'transparent' ? 'active' : ''}`} onClick={() => updateCoverStyle({ strokeColor: 'transparent', strokeWidth: 0 })}>无</button>
            <button type="button" className={`pill ${coverStyle.strokeColor === '#000000' ? 'active' : ''}`} onClick={() => updateCoverStyle({ strokeColor: '#000000', strokeWidth: Math.max(1, coverStyle.strokeWidth) })}>黑</button>
            <button type="button" className={`pill ${coverStyle.strokeColor === '#FFFFFF' ? 'active' : ''}`} onClick={() => updateCoverStyle({ strokeColor: '#FFFFFF', strokeWidth: Math.max(1, coverStyle.strokeWidth) })}>白</button>
          </div>
        </div>
        <div className="setting-row">
          <span>标题粗细</span>
          <div className="pill-row">
            <button type="button" className={`pill ${!coverStyle.bold ? 'active' : ''}`} onClick={() => updateCoverStyle({ bold: false })}>常规</button>
            <button type="button" className={`pill ${coverStyle.bold ? 'active' : ''}`} onClick={() => updateCoverStyle({ bold: true })}>加粗</button>
          </div>
        </div>
      </div>
      <div className="merged-right preview-wrapper">
        <canvas ref={canvasRef} className="cover-canvas merged-canvas" />
      </div>
      <button
        className="btn-primary full merged-submit"
        type="button"
        disabled={composing}
        onClick={async () => {
          const canvas = canvasRef.current
          if (!canvas) {
            addToast({ type: 'error', message: '封面画布未就绪，请稍后重试' })
            return
          }

          const activeRewrite = rewriteVariants.find((item) => item.id === selectedRewriteId)
          if (!activeRewrite?.fullText.trim()) {
            addToast({ type: 'error', message: '请先确认改写文案，再进行预览合成' })
            return
          }

          try {
            setComposing(true)
            setPreviewComposed(false)
            setStepState(3, 'running')
            setComposeStatus('正在植入标题与字幕...')
            const coverData = canvas.toDataURL('image/png')
            setCoverImage(coverData)
            if (!previewVideoUrl) throw new Error('未检测到数字人视频，请先完成上一步生成')
            const burnData = await burnPreviewVideoLocal({
              videoUrl: previewVideoUrl,
              titleText: coverTitle,
              subtitleText,
              titleStyle: coverStyle as unknown as Record<string, unknown>,
              subtitleStyle: subtitleStyle as unknown as Record<string, unknown>,
            })
            if (!burnData.videoPath) throw new Error('预览视频生成失败')
            setPreviewVideoUrl(resolveAssetUrl(burnData.videoPath))
            setComposing(false)
            setPreviewComposed(true)
            setStepState(3, 'done')
            setComposeStatus('标题与字幕已植入，可直接预览')
            setPreviewTab('preview')
            addToast({ type: 'success', message: '已生成带标题与字幕的预览视频' })
          } catch (error) {
            setComposing(false)
            setStepState(3, 'pending')
            const message = error instanceof Error ? error.message : '预览生成失败'
            addToast({ type: 'error', message })
          }
        }}
      >
        {composing ? '植入处理中...' : '添加标题和字幕并预览'}
      </button>
      <p className="hint" style={{ marginTop: 8 }}>{composeStatus}</p>
    </div>
  )
}
