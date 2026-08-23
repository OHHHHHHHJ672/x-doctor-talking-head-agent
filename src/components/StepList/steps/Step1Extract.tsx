import { FileText, Upload } from 'lucide-react'
import { useState } from 'react'
import { extractCopyFromFile, rewriteCopySmart } from '../../../lib/edgeApi'
import { useProjectStore } from '../../../store/useProjectStore'

export function Step1Extract() {
  const {
    addToast,
    completeStep,
    extractedCopy,
    selectCoverTitle,
    setExtractedCopy,
    setPreviewTab,
    setRewriteVariants,
    setSelectedRewrite,
    updateCoverTitleText,
  } = useProjectStore((state) => state)
  const [mode, setMode] = useState<'manual' | 'transcribe'>('manual')
  const [manualText, setManualText] = useState(extractedCopy)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)

  const applyText = (text: string, label: string) => {
    const normalized = text.trim()
    if (!normalized) {
      addToast({ type: 'error', message: '文案不能为空' })
      return
    }
    setExtractedCopy(normalized)
    setRewriteVariants([
      { id: 'A', name: label, similarity: '当前版本', preview: normalized.slice(0, 120), fullText: normalized },
      { id: 'B', name: '备用', similarity: '-', preview: '', fullText: '' },
      { id: 'C', name: '备用', similarity: '-', preview: '', fullText: '' },
    ])
    setSelectedRewrite('A')
    updateCoverTitleText('A', normalized.slice(0, 22))
    selectCoverTitle('A')
    setPreviewTab('copy')
    completeStep(1)
  }

  const useManualText = () => {
    applyText(manualText, '手动文案')
    if (manualText.trim()) addToast({ type: 'success', message: '文案已保存，可以准备声音与人物视频' })
  }

  const runExtract = async () => {
    if (isExtracting) return
    if (!selectedFile) {
      addToast({ type: 'error', message: '请先选择本地视频文件' })
      return
    }
    if (selectedFile.size > 2 * 1024 * 1024 * 1024) {
      addToast({ type: 'error', message: '视频不能超过 2 GB，请先压缩或裁剪' })
      return
    }

    setIsExtracting(true)
    addToast({ type: 'loading', message: '正在提取音频并调用可选转写工作流...' })
    try {
      const data = await extractCopyFromFile(selectedFile)
      const extractedText = String(data.text || '').trim()
      if (!data.ok || !extractedText) {
        throw new Error(data.error || '转写结果为空，请更换视频或直接粘贴文案')
      }

      let finalText = extractedText
      let label = '视频转写原文'
      try {
        const rewritten = await rewriteCopySmart(extractedText)
        if (rewritten.rewrittenCopy.trim()) {
          finalText = rewritten.rewrittenCopy.trim()
          label = 'AI 改写文案'
          rewritten.titleCandidates.slice(0, 3).forEach((title, index) => {
            const id = ['A', 'B', 'C'][index] as 'A' | 'B' | 'C'
            if (title) updateCoverTitleText(id, title)
          })
        }
      } catch {
        addToast({ type: 'success', message: '转写已完成；未配置文案改写工作流，已保留原文' })
      }

      setManualText(finalText)
      applyText(finalText, label)
      addToast({ type: 'success', message: `文案已准备，共 ${finalText.length} 字` })
    } catch (error) {
      addToast({ type: 'error', message: error instanceof Error ? error.message : '视频转写失败' })
    } finally {
      setIsExtracting(false)
    }
  }

  return (
    <div className="step-pane copy-source-pane">
      <div className="segmented-control" aria-label="文案来源">
        <button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>
          <FileText size={16} /> 直接输入
        </button>
        <button type="button" className={mode === 'transcribe' ? 'active' : ''} onClick={() => setMode('transcribe')}>
          <Upload size={16} /> 视频转写（可选）
        </button>
      </div>

      {mode === 'manual' ? (
        <div className="manual-copy-editor">
          <label htmlFor="source-copy">口播文案</label>
          <textarea
            id="source-copy"
            className="copy-input"
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            placeholder="在这里粘贴或输入最终要说的文案。无需配置转写和改写工作流。"
            maxLength={10000}
          />
          <div className="editor-footer">
            <span>{manualText.length.toLocaleString()} / 10,000 字</span>
            <button className="btn-primary" type="button" onClick={useManualText} disabled={!manualText.trim()}>
              使用这段文案
            </button>
          </div>
        </div>
      ) : (
        <div className="transcribe-panel">
          <div className="row">
            <input className="input flex-1" value={selectedFile?.name || ''} placeholder="选择本地视频（MP4/MOV/MKV/AVI）" readOnly />
            <label className="btn-secondary file-picker">
              <Upload size={16} /> 选择视频
              <input
                type="file"
                accept=".mp4,.mov,.mkv,.avi,video/*"
                hidden
                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                disabled={isExtracting}
              />
            </label>
            <button className="btn-primary" type="button" onClick={() => void runExtract()} disabled={!selectedFile || isExtracting}>
              {isExtracting ? '正在转写...' : '开始转写'}
            </button>
          </div>
          <p className="hint">此功能需要在 RunningHub 设置中额外配置视频转写工作流；文案改写工作流可不配置。</p>
          {isExtracting && <div className="extract-status" role="status" aria-live="polite">正在处理视频，请保持窗口打开...</div>}
        </div>
      )}
    </div>
  )
}
