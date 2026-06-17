import { useToast } from '../context/ToastContext'
import { Toast } from './Toast'

export function ToastContainer() {
  const { toasts, removeToast } = useToast()
  if (toasts.length === 0) return null
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={removeToast} />
      ))}
    </div>
  )
}
