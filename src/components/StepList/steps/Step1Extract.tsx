import { useState } from 'react'
import { extractCopyFromFile, rewriteCopySmart } from '../../../lib/edgeApi'
import { useProjectStore } from '../../../store/useProjectStore'

export function Step1Extract() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const {
    addToast,
    setExtractedCopy,
    setRewriteVariants,
    setSelectedRewrite,
    setPreviewTab,
    extractedCopy,
    completeStep,
    updateCoverTitleText,
    selectCoverTitle,
  } = useProjectStore((s) => s)

  const runExtract = async () => {
    if (isExtracting) return
    if (!selectedFile) {
      addToast({ type: 'error', message: '请先选择本地视频文件' })
      return
    }

    setIsExtracting(true)
    addToast({ type: 'loading', message: '正在处理视频并提取文案...' })
    try {
      const data = await extractCopyFromFile(selectedFile)
      if (!data.ok) {
        const message =
          data.error ||
          (data.code === 'ffmpeg_missing' || data.code === 'whisper_missing'
            ? '处理组件不可用，请联系管理员检查环境'
            : '提取失败，请稍后重试')
        throw new Error(message)
      }
      const extractedText = String(data.text || '').trim()
      if (!extractedText) {
        throw new Error('提取成功但文案为空，请重试或更换视频素材')
      }
      addToast({ type: 'loading', message: '文案提取完成，正在进行 AI 智能改写...' })
      const rewritten = await rewriteCopySmart(extractedText)
      setExtractedCopy(extractedText)
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
      setPreviewTab('copy')
      completeStep(1)
      addToast({
        type: 'success',
        message: `提取与改写完成（原文${extractedText.length}字）`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '提取失败'
      addToast({ type: 'error', message })
    } finally {
      setIsExtracting(false)
    }
  }

  return (
    <div className="step-pane">
      <div className="row">
        <input className="input flex-1" value={selectedFile?.name || ''} placeholder="请选择本地视频文件（mp4/mov）" readOnly />
        <label className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
          选择文件
          <input
            type="file"
            accept=".mp4,.mov,.mkv,.avi,video/*"
            hidden
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            disabled={isExtracting}
          />
        </label>
        <button className="btn-primary" onClick={runExtract} disabled={!selectedFile || isExtracting}>
          {isExtracting ? '提取中...' : '提取文案'}
        </button>
      </div>
      {!!selectedFile && <p className="hint" style={{ marginTop: 8 }}>已选择：{selectedFile.name}</p>}
      {isExtracting && (
        <div className="extract-status" role="status" aria-live="polite">
          <span className="extract-spinner" aria-hidden="true" />
          <span className="extract-status-text">正在提取音频并转写，请稍候</span>
          <span className="extract-status-dots" aria-hidden="true">...</span>
        </div>
      )}
      <div className="row">
        <span className="mini-badge done">{extractedCopy.length}字</span>
      </div>
      <div className="copy-preview-scroll">
        {extractedCopy || '提取完成后，这里会显示完整文案，可直接滚动查看。'}
      </div>
      <p className="hint cookie-hint">当前模式为本地文件处理：选择视频后即可自动提取文案。</p>
    </div>
  )
}
