import type { SyncDomain } from '../types'
import { Tag } from './Tag'

interface Props {
  domain: SyncDomain
  checked: boolean
  onChange: (key: string, checked: boolean) => void
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  diagnostic: 'Diagnóstico',
  discovery: 'Discovery',
  planned: 'Planned',
}

const STATUS_TONE: Record<string, 'green' | 'amber' | 'gray'> = {
  active: 'green',
  diagnostic: 'amber',
  discovery: 'gray',
  planned: 'gray',
}

const CAPABILITY: Record<string, string> = {
  products: 'Permite analizar y sincronizar.',
  categories: 'Hoy permite ver y diagnosticar, no aplicar cambios.',
  orders: 'Hoy permite descubrimiento, no sincronización automática.',
}

export function DomainCard({ domain, checked, onChange }: Props) {
  const tone = STATUS_TONE[domain.status] ?? 'gray'
  const label = STATUS_LABEL[domain.status] ?? domain.status
  const capability = CAPABILITY[domain.key] ?? ''
  const scope = domain.scope?.join(', ') ?? ''

  return (
    <div className="domain-card">
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(domain.key, e.target.checked)}
        />
        <div>
          <div className="domain-card-title">{domain.key}</div>
          <div className="domain-card-copy">
            {capability} {scope}
          </div>
        </div>
      </label>
      <div className="domain-meta">
        <Tag tone={tone}>{label}</Tag>
        <Tag tone="gray">Fuente: {domain.sourceOfTruth}</Tag>
      </div>
    </div>
  )
}
