import type { MessageKind } from '../types'

interface Props {
  kind: MessageKind
  children: React.ReactNode
}

export function MessageBox({ kind, children }: Props) {
  return <div className={`message-box message-${kind}`}>{children}</div>
}
