import type { TagTone } from '../types'

interface Props {
  tone: TagTone
  children: React.ReactNode
}

export function Tag({ tone, children }: Props) {
  return <span className={`tag ${tone}`}>{children}</span>
}
