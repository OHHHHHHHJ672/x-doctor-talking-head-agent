import { useEffect, useRef } from 'react'
import { resolveAssetUrl } from '../../../lib/edgeApi'
import { useProjectStore } from '../../../store/useProjectStore'

export function Step6Cover() {
  const {
    setStepState,
    coverTitleVariants,
    selectedCoverTitleId,
    selectCoverTitle,
    updateCoverTitleText,
    coverTitle,
    coverStyle,
    updateCoverStyle,
    setCoverImage,
    avatars,
    selectedAvatarId,
  } = useProjectStore((s) => s)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const lines: string[] = []
    let current = ''
    for (const ch of text) {
      const candidate = current + ch
      if (ctx.measureText(candidate).width > maxWidth * 0.9) {
        if (current.length === 0) {
          current = ch
          continue
        }
        lines.push(current)
        current = ch
        if (lines.length >= 2) break
      } else {
        current = candidate
      }
    }
    if (lines.length < 2) lines.push(current)
    lines.splice(2)
    if (lines[1]) {
      while (ctx.measureText(`${lines[1]}...`).width > maxWidth * 0.9 && lines[1].length > 1) {
        lines[1] = lines[1].slice(0, -1)
      }
      if (ctx.measureText(lines[1]).width > maxWidth * 0.9) {
        lines[1] = `${lines[1].slice(0, Math.max(0, lines[1].length - 3))}...`
      }
    }
    return lines
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = 270
    canvas.height = 480
    const selectedAvatar = avatars.find((avatar) => avatar.id === selectedAvatarId)

    const drawText = () => {
      ctx.font = `${coverStyle.bold ? '700' : '500'} ${coverStyle.fontSize}px Geist, sans-serif`
      const lines = wrapText(ctx, coverTitle, canvas.width)
      const lineHeight = coverStyle.fontSize * 1.2
      const blockH = lines.length * lineHeight + 16
      const startY = canvas.height * 0.08
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(canvas.width * 0.05, startY - 10, canvas.width * 0.9, blockH)
      ctx.textAlign = 'center'
      ctx.lineJoin = 'round'
      ctx.miterLimit = 2
      lines.forEach((line, index) => {
        const y = startY + index * lineHeight + coverStyle.fontSize
        if (coverStyle.strokeWidth > 0) {
          ctx.lineWidth = coverStyle.strokeWidth * 2
          ctx.strokeStyle = coverStyle.strokeColor
          ctx.strokeText(line, canvas.width / 2, y)
        }
        ctx.fillStyle = coverStyle.fontColor
        ctx.fillText(line, canvas.width / 2, y)
      })
    }

    if (!selectedAvatar) {
      ctx.fillStyle = '#dbeafe'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#bfdbfe'
      ctx.fillRect(0, canvas.height * 0.6, canvas.width, canvas.height * 0.4)
      drawText()
      return
    }

    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      drawText()
    }
    image.src = resolveAssetUrl(selectedAvatar.thumbnailPath)
  }, [coverStyle, coverTitle, avatars, selectedAvatarId])

  return (
    <div className="step-pane cover-layout">
      <div className="cover-titles">
        {coverTitleVariants.map((plan) => (
          <label
            key={plan.id}
            className={`cover-title-row ${selectedCoverTitleId === plan.id ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="cover-title"
              checked={selectedCoverTitleId === plan.id}
              onChange={() => selectCoverTitle(plan.id)}
            />
            <input
              type="text"
              className="cover-title-input"
              placeholder="输入自定义标题..."
              value={plan.text}
              onFocus={() => selectCoverTitle(plan.id)}
              onMouseDown={() => selectCoverTitle(plan.id)}
              onChange={(e) => updateCoverTitleText(plan.id, e.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="cover-side">
        <canvas ref={canvasRef} className="cover-canvas" />
        <div className="cover-controls">
          <label className="setting-row">
            <span>字号</span>
            <input
              className="input mini-input"
              type="number"
              min={32}
              max={72}
              value={coverStyle.fontSize}
              onChange={(e) => updateCoverStyle({ fontSize: Number(e.target.value) })}
            />
          </label>
          <div className="setting-row">
            <span>字体颜色</span>
            <div className="pill-row">
              <button
                type="button"
                className={`pill ${coverStyle.fontColor === '#FFFFFF' ? 'active' : ''}`}
                onClick={() => updateCoverStyle({ fontColor: '#FFFFFF' })}
              >
                白
              </button>
              <button
                type="button"
                className={`pill ${coverStyle.fontColor === '#FACC15' ? 'active' : ''}`}
                onClick={() => updateCoverStyle({ fontColor: '#FACC15' })}
              >
                黄
              </button>
              <button
                type="button"
                className={`pill ${coverStyle.fontColor === '#EF4444' ? 'active' : ''}`}
                onClick={() => updateCoverStyle({ fontColor: '#EF4444' })}
              >
                红
              </button>
            </div>
          </div>
          <div className="setting-row">
            <span>描边颜色</span>
            <div className="pill-row">
              <button
                type="button"
                className={`pill ${coverStyle.strokeColor === 'transparent' ? 'active' : ''}`}
                onClick={() => updateCoverStyle({ strokeColor: 'transparent', strokeWidth: 0 })}
              >
                无
              </button>
              <button
                type="button"
                className={`pill ${coverStyle.strokeColor === '#000000' ? 'active' : ''}`}
                onClick={() => updateCoverStyle({ strokeColor: '#000000', strokeWidth: Math.max(coverStyle.strokeWidth, 1) })}
              >
                黑
              </button>
              <button
                type="button"
                className={`pill ${coverStyle.strokeColor === '#FFFFFF' ? 'active' : ''}`}
                onClick={() => updateCoverStyle({ strokeColor: '#FFFFFF', strokeWidth: Math.max(coverStyle.strokeWidth, 1) })}
              >
                白
              </button>
            </div>
          </div>
          <label className="setting-row">
            <span>描边宽度</span>
            <input
              className="input mini-input"
              type="number"
              min={0}
              max={6}
              value={coverStyle.strokeWidth}
              onChange={(e) => updateCoverStyle({ strokeWidth: Number(e.target.value) })}
            />
          </label>
          <div className="setting-row">
            <span>字体粗细</span>
            <div className="pill-row">
              <button
                type="button"
                className={`pill ${!coverStyle.bold ? 'active' : ''}`}
                onClick={() => updateCoverStyle({ bold: false })}
              >
                常规
              </button>
              <button
                type="button"
                className={`pill ${coverStyle.bold ? 'active' : ''}`}
                onClick={() => updateCoverStyle({ bold: true })}
              >
                加粗
              </button>
            </div>
          </div>
        </div>
        <button
          className="btn-primary full"
          onClick={() => {
            const canvas = canvasRef.current
            if (canvas) setCoverImage(canvas.toDataURL('image/png'))
            setStepState(6, 'done')
          }}
        >
          完成步骤6并进入发布
        </button>
      </div>
    </div>
  )
}
