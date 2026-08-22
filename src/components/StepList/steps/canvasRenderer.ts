export const CANVAS_W = 360
export const CANVAS_H = 640

export interface TextStyle {
  fontSize: number
  fontColor: string
  strokeColor: string
  strokeWidth: number
  bold: boolean
}

interface RenderOptions {
  titleText: string
  subtitleText: string
  titleStyle: TextStyle
  subtitleStyle: TextStyle
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let currentLine = ''

  for (const char of text) {
    const testLine = currentLine + char
    if (ctx.measureText(testLine).width > maxWidth && currentLine !== '') {
      lines.push(currentLine)
      currentLine = char
      if (lines.length >= 2) break
    } else {
      currentLine = testLine
    }
  }

  if (currentLine && lines.length < 2) {
    while (ctx.measureText(`${currentLine}...`).width > maxWidth && currentLine.length > 0) {
      currentLine = currentLine.slice(0, -1)
    }
    const willOverflowSecondLine = lines.length === 1 && text !== `${lines[0]}${currentLine}`
    lines.push(willOverflowSecondLine ? `${currentLine}...` : currentLine)
  }

  return lines
}

export function renderCanvas(
  ctx: CanvasRenderingContext2D,
  bgImage: HTMLImageElement | null,
  options: RenderOptions,
) {
  const W = CANVAS_W
  const H = CANVAS_H
  ctx.clearRect(0, 0, W, H)

  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, W, H)
  } else {
    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(0, 0, W, H)
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.miterLimit = 2

  const titleFontSize = Math.max(16, Math.min(Number(options.titleStyle.fontSize), 60))
  ctx.font = `${options.titleStyle.bold ? '700' : '400'} ${titleFontSize}px Geist, sans-serif`
  const titleLines = wrapText(ctx, options.titleText, W * 0.88)
  const titleLineH = titleFontSize * 1.3
  const titleBlockH = titleLines.length * titleLineH + 20
  ctx.fillStyle = 'rgba(0,0,0,0.50)'
  ctx.fillRect(0, H * 0.06, W, titleBlockH)

  titleLines.forEach((line, i) => {
    const y = H * 0.06 + titleFontSize + i * titleLineH + 8
    if (options.titleStyle.strokeWidth > 0 && options.titleStyle.strokeColor !== 'transparent') {
      ctx.strokeStyle = options.titleStyle.strokeColor
      ctx.lineWidth = options.titleStyle.strokeWidth * 2
      ctx.strokeText(line, W / 2, y)
    }
    ctx.fillStyle = options.titleStyle.fontColor
    ctx.fillText(line, W / 2, y)
  })

  const subFontSize = Math.max(12, Math.min(Number(options.subtitleStyle.fontSize), 48))
  ctx.font = `${options.subtitleStyle.bold ? '700' : '400'} ${subFontSize}px Geist, sans-serif`
  const subtitlePreview = options.subtitleText.slice(0, 20)
  const subLines = wrapText(ctx, subtitlePreview, W * 0.9)
  const subLineH = subFontSize * 1.3
  const subBlockH = subLines.length * subLineH + 16
  const subStartY = H - H * 0.1 - subBlockH
  const safeBottom = H - 8
  const clampedSubY = Math.min(subStartY, safeBottom - subBlockH)

  ctx.fillStyle = 'rgba(0,0,0,0.40)'
  ctx.fillRect(0, clampedSubY, W, subBlockH)
  subLines.forEach((line, i) => {
    const y = clampedSubY + subFontSize + i * subLineH + 4
    if (options.subtitleStyle.strokeWidth > 0 && options.subtitleStyle.strokeColor !== 'transparent') {
      ctx.strokeStyle = options.subtitleStyle.strokeColor
      ctx.lineWidth = options.subtitleStyle.strokeWidth * 2
      ctx.strokeText(line, W / 2, y)
    }
    ctx.fillStyle = options.subtitleStyle.fontColor
    ctx.fillText(line, W / 2, y)
  })
}
