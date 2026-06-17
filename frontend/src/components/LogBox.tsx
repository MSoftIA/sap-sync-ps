import { useEffect, useRef } from 'react'

export interface LogEntry {
  text: string
  cls: 'info' | 'warn' | 'error' | 'done-ok' | 'done-err'
}

interface Props {
  entries: LogEntry[]
}

export function LogBox({ entries }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [entries])

  return (
    <div className="log-box" ref={ref}>
      {entries.length === 0 ? (
        <div className="log-line info">Los logs de la sync aparecerán aquí.</div>
      ) : (
        entries.map((entry, i) => (
          <div key={i} className={`log-line ${entry.cls}`}>
            {entry.text}
          </div>
        ))
      )}
    </div>
  )
}
