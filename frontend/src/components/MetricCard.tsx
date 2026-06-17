interface Props {
  label: string
  value: React.ReactNode
  hint?: string
}

export function MetricCard({ label, value, hint }: Props) {
  return (
    <div className="card metric-card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}
