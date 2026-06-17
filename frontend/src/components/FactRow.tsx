interface Props {
  label: string
  value: React.ReactNode
  last?: boolean
}

export function FactRow({ label, value, last }: Props) {
  return (
    <div className={`fact-row${last ? ' last' : ''}`}>
      <div className="fact-label">{label}</div>
      <div className="fact-value">{value}</div>
    </div>
  )
}
