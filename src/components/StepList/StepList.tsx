import { motion } from 'framer-motion'
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
          ? `📝 文案已提取并完成智能改写：${(selectedRewrite?.fullText || extractedCopy).slice(0, 20)}...`
          : '📝 待提取并改写文案',
        2:
          submittedAudio && selectedAvatar
            ? `🎵🎬 音频+形象已上传并提交完成（${submittedAudio.name} / ${selectedAvatar.name}）`
            : submittedAudio
              ? `🎵 音频已上传：${submittedAudio.name}，待上传数字人形象`
              : '🎵🎬 待准备素材（音频与形象）',
        3: coverTitle || subtitleText
          ? `🖼️ 封面与字幕已配置：${coverTitle.slice(0, 14)}... / 💬「${subtitleText.slice(0, 10)}...」`
          : '🖼️ 待配置封面与字幕',
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

      <motion.div key={activeStep} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.12 }} className="step-scroll step-scroll-horizontal">
        <div className="step-row">
          {steps.map((step) => (
            <div key={step.id} className="step-col">
              <StepCard
                step={step}
                summary={stepSummary[step.id as keyof typeof stepSummary]}
                dimmed={step.id > activeStep && step.state !== 'done'}
                collapsed={false}
              >
                {stepContent[step.id]}
              </StepCard>
            </div>
          ))}
        </div>
      </motion.div>
      <footer className="flow-footer">
        <div className="flow-footer-meta">
          <span>流程进度</span>
          <strong>{doneSteps.length}/3 已完成</strong>
        </div>
        <div className="flow-footer-actions">
          <button className="btn-secondary" type="button" onClick={() => canGoPrev && setActiveStep(activeStep - 1)} disabled={!canGoPrev}>
            上一步
          </button>
          <button className="btn-primary" type="button" onClick={() => canGoNext && setActiveStep(activeStep + 1)} disabled={!canGoNext}>
            下一步
          </button>
        </div>
      </footer>
    </main>
  )
}
