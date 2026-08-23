import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { StepCard } from './StepCard'
import { Step1Extract } from './steps/Step1Extract'
import { Step3Audio } from './steps/Step3Audio'
import { Step5Subtitle } from './steps/Step5Subtitle'
import { useProjectStore } from '../../store/useProjectStore'

const stepContent: Record<number, ReactNode> = {
  1: <Step1Extract />,
  2: <Step3Audio />,
  3: <Step5Subtitle />,
}

export function StepList() {
  const {
    steps,
    activeStep,
    setActiveStep,
    extractedCopy,
    submittedAudio,
    avatars,
    selectedAvatarId,
    rewriteVariants,
    selectedRewriteId,
    coverTitle,
    subtitleText,
  } = useProjectStore()
  const doneSteps = steps.filter((step) => step.state === 'done')
  const canGoPrev = activeStep > 1
  const canGoNext = activeStep < steps.length

  const stepSummary = useMemo(
    () => {
      const selectedRewrite = rewriteVariants.find((item) => item.id === selectedRewriteId)
      const selectedAvatar = avatars.find((item) => item.id === selectedAvatarId)
      return {
        1: extractedCopy
          ? `文案已准备：${(selectedRewrite?.fullText || extractedCopy).slice(0, 20)}...`
          : '等待输入或转写文案',
        2:
          submittedAudio && selectedAvatar
            ? `声音与人物已生成（${submittedAudio.name} / ${selectedAvatar.name}）`
            : submittedAudio
              ? `声音已上传：${submittedAudio.name}，等待人物视频`
              : '等待上传声音与人物视频',
        3: coverTitle || subtitleText
          ? `标题与字幕已配置：${coverTitle.slice(0, 14)}... / ${subtitleText.slice(0, 10)}...`
          : '等待配置标题、字幕与导出',
      }
    },
    [avatars, coverTitle, extractedCopy, rewriteVariants, selectedAvatarId, selectedRewriteId, submittedAudio, subtitleText],
  )

  return (
    <main className="step-section flow-layout">
      <header className="flow-top">
        <div className="flow-stepper">
          {steps.map((step, index) => {
            const isActive = step.id === activeStep
            return (
              <button
                key={step.id}
                className={`flow-stepper-item ${step.state} ${isActive ? 'active' : ''}`}
                onClick={() => setActiveStep(step.id)}
                type="button"
              >
                <span className="flow-stepper-index">{step.id}</span>
                <span className="flow-stepper-label">{step.title}</span>
                {index < steps.length - 1 && <span className="flow-stepper-link" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
        <span className="badge running">当前步骤 {activeStep}/3</span>
      </header>

      <motion.div key={activeStep} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }} className="step-scroll">
        <StepCard
          step={steps[activeStep - 1]}
          summary={stepSummary[activeStep as keyof typeof stepSummary]}
          dimmed={false}
          collapsed={false}
        >
          {stepContent[activeStep]}
        </StepCard>
      </motion.div>
      <footer className="flow-footer">
        <div className="flow-footer-meta">
          <span>流程进度</span>
          <strong>{doneSteps.length}/3 已完成</strong>
        </div>
        <div className="flow-footer-actions">
          <button className="btn-secondary" type="button" onClick={() => canGoPrev && setActiveStep(activeStep - 1)} disabled={!canGoPrev}>
            <ChevronLeft size={16} /> 上一步
          </button>
          <button className="btn-primary" type="button" onClick={() => canGoNext && setActiveStep(activeStep + 1)} disabled={!canGoNext}>
            下一步 <ChevronRight size={16} />
          </button>
        </div>
      </footer>
    </main>
  )
}
