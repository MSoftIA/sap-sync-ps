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

import type { LogEntry } from './components/LogBox'
import type { SyncProgress } from './types'

export function parseLogLine(raw: string): { text: string; cls: LogEntry['cls']; progress?: SyncProgress } {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    let progress: SyncProgress | undefined
    if (obj.message === 'Progreso de dominio') {
      progress = {
        domain: String(obj.domain ?? ''),
        current: Number(obj.current ?? 0),
        total: Number(obj.total ?? 0),
        percent: Number(obj.percent ?? 0),
        itemCode: String(obj.itemCode ?? ''),
        known: Number.isFinite(Number(obj.total)) && Number(obj.total) > 0,
      }
    }
    const time = obj.ts ? new Date(String(obj.ts)).toLocaleTimeString('es') : ''
    const level = String(obj.level ?? 'info')
    const text = `[${time}] ${level.toUpperCase()} ${String(obj.message ?? raw)}` + buildLogDetails(obj)
    const cls: LogEntry['cls'] = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'
    return { text, cls, progress }
  } catch {
    return { text: raw, cls: 'info' }
  }
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
