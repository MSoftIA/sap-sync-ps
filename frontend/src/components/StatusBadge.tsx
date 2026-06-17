import type { StatusTone } from '../types'

interface Props {
  tone: StatusTone
  children: React.ReactNode
}

export function StatusBadge({ tone, children }: Props) {
  return (
    <span className={`status-badge status-${tone}`}>
      {children}
    </span>
  )
}
