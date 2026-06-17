import { fmt } from '../utils'

interface BarItem {
  label: string
  value: number
  color?: string
}

interface Props {
  items: BarItem[]
  maxValue?: number
}

const DEFAULT_COLORS = ['#3659e3', '#15803d', '#b45309', '#667085', '#b91c1c', '#6ea8fe']

export function BarChart({ items, maxValue }: Props) {
  const max = maxValue ?? Math.max(...items.map(i => i.value), 1)

  return (
    <div className="bar-chart">
      {items.map((item, idx) => {
        const pct = max > 0 ? Math.round((item.value / max) * 100) : 0
        const color = item.color ?? DEFAULT_COLORS[idx % DEFAULT_COLORS.length]
        return (
          <div key={item.label} className="bar-chart-row">
            <span className="bar-chart-label">{item.label}</span>
            <div className="bar-chart-track">
              <div
                className="bar-chart-fill"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
            <span className="bar-chart-value">{fmt(item.value)}</span>
          </div>
        )
      })}
    </div>
  )
}
