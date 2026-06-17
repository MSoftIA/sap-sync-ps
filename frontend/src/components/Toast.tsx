import type { Toast as ToastType } from '../context/ToastContext'

const ICONS: Record<ToastType['kind'], string> = {
  success: '✓',
  error: '✕',
  warn: '⚠',
  info: 'i',
}

interface Props {
  toast: ToastType
  onDismiss: (id: string) => void
}

export function Toast({ toast, onDismiss }: Props) {
  return (
    <div className={`toast ${toast.kind}`} onClick={() => onDismiss(toast.id)} role="alert">
      <span style={{ fontWeight: 900, fontSize: '1rem' }}>{ICONS[toast.kind]}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
    </div>
  )
}
