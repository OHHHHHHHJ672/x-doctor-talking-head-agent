import { Check } from 'lucide-react'
import type { ProjectStep } from '../../store/useProjectStore'

interface StepCardProps {
  step: ProjectStep
  collapsed?: boolean
  summary?: string
  onExpand?: () => void
  dimmed?: boolean
  children?: React.ReactNode
}

export function StepCard({ step, collapsed = false, summary = '', onExpand, dimmed = false, children }: StepCardProps) {
  return (
    <article className={`step-card expanded panel-${step.state} ${dimmed ? 'is-dimmed' : ''} ${collapsed ? 'done-collapsed' : ''}`}>
      <div className="step-head static">
        <span className={`step-index ${step.state}`}>
          {step.state === 'done' ? <Check size={12} /> : step.id}
        </span>
        <div className="step-body">
          <div className="step-title-row">
            <p>{step.title}</p>
            {collapsed && (
              <button type="button" className="expand-link" onClick={onExpand}>
                展开 ›
              </button>
            )}
          </div>
          <p className="step-desc">{collapsed ? summary : step.description}</p>
        </div>
      </div>
      {!collapsed && <div className="step-content always-open">{children}</div>}
    </article>
  )
}
