export function fmt(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  if (typeof value === 'number') return value.toLocaleString('es')
  return String(value)
}

export function money(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  return '$ ' + Number(value).toLocaleString('es', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function number(value: unknown, decimals = 0): string {
  if (value === undefined || value === null || value === '') return '-'
  return Number(value).toLocaleString('es', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('es')
}

export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('es')
}

const PREFERRED_LOG_KEYS = [
  'itemCode', 'reference', 'productId', 'action', 'status',
  'details', 'payloadSummary', 'sapPrice', 'prestashopProductPrice',
  'sapStock', 'childSapLimit', 'effectiveSapLimit',
]

export function buildLogDetails(obj: Record<string, unknown>): string {
  const pairs: string[] = []
  for (const key of PREFERRED_LOG_KEYS) {
    if (!(key in obj)) continue
    const val = obj[key]
    if (val === undefined || val === null || val === '') continue
    const str = Array.isArray(val) ? val.join(', ') : typeof val === 'object' ? JSON.stringify(val) : String(val)
    if (str) pairs.push(`${key}=${str}`)
  }
  return pairs.length ? ' | ' + pairs.join(' | ') : ''
}
