import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useProjectStore } from '../../store/useProjectStore'

export function ToastViewport() {
  const { toasts, removeToast } = useProjectStore()

  useEffect(() => {
    const timers = toasts.map((toast) =>
      window.setTimeout(() => removeToast(toast.id), 3000),
    )
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [toasts, removeToast])

  return (
    <div className="toast-wrap">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.12 }}
            className={`toast ${toast.type}`}
          >
            {toast.type === 'loading' && <Loader2 size={13} className="spin" />}
            <span>{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
