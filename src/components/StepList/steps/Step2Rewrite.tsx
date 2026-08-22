import { useState } from 'react'
import { rewriteCopySmart } from '../../../lib/edgeApi'
import { useProjectStore } from '../../../store/useProjectStore'

export function Step2Rewrite() {
  const {
    rewriteVariants,
    selectedRewriteId,
    setSelectedRewrite,
    setRewriteVariants,
    setPreviewTab,
    addToast,
    extractedCopy,
    updateCoverTitleText,
    selectCoverTitle,
  } =
    useProjectStore()
  const selected = rewriteVariants.find((item) => item.id === selectedRewriteId)
  const [isGenerating, setIsGenerating] = useState(false)

  const generateRewrite = async () => {
    if (!extractedCopy.trim()) {
      addToast({ type: 'error', message: '请先在步骤1提取文案' })
      return
    }
    try {
      setIsGenerating(true)
      addToast({ type: 'loading', message: '正在调用云端智能改写...' })
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
      setPreviewTab('copy')
      addToast({ type: 'success', message: '改写完成' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '改写失败'
      addToast({ type: 'error', message })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="step-pane">
      <div className="rewrite-tabs">
        {rewriteVariants.map((sample) => (
          <button
            type="button"
            key={sample.id}
            className={`rewrite-tab ${selectedRewriteId === sample.id ? 'selected' : ''}`}
            onClick={() => {
              setSelectedRewrite(sample.id)
              setPreviewTab('copy')
            }}
          >
            <span>{sample.name}</span>
            <small>{sample.similarity.replace('相似度约 ', '')}</small>
          </button>
        ))}
      </div>
      <div className="rewrite-preview-box">
        <p>{selected?.fullText ?? selected?.preview}</p>
      </div>
      <div className="align-right">
        <button className="text-link" onClick={() => void generateRewrite()} disabled={isGenerating}>
          {isGenerating ? '生成中...' : '重新生成'}
        </button>
      </div>
    </div>
  )
}
