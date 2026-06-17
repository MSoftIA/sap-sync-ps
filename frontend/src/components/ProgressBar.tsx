interface Props {
  title: string
  meta: string
  note: string
  percent: number
  known: boolean
  running: boolean
}

export function ProgressBar({ title, meta, note, percent, known, running }: Props) {
  const indeterminate = running && !known

  return (
    <div className="progress-shell">
      <div className="progress-topline">
        <div className="progress-title">{title}</div>
        <div className="progress-meta">{meta}</div>
      </div>
      <div className={`progress-track${indeterminate ? ' indeterminate' : ''}`}>
        <div
          className="progress-bar"
          style={indeterminate ? undefined : { width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      <div className="progress-note">{note}</div>
    </div>
  )
}
