import type { SyncDomain, SyncStatus } from '../types'

export async function getSyncStatus(): Promise<SyncStatus> {
  const res = await fetch('/api/status')
  if (!res.ok) throw new Error('Error al cargar status: ' + res.status)
  return res.json()
}

export async function getSyncDomains(): Promise<SyncDomain[]> {
  const res = await fetch('/api/sync-domains')
  if (!res.ok) throw new Error('Error al cargar sync-domains: ' + res.status)
  const data = await res.json()
  return Array.isArray(data.domains) ? data.domains : []
}

export interface SyncOptions {
  fullCatalog?: boolean
  itemCode?: string
  limit?: string
  write: boolean
  domains: string[]
}

export function startSyncStream(options: SyncOptions): EventSource {
  const params = new URLSearchParams()

  if (options.fullCatalog) {
    params.set('fullCatalog', 'true')
  } else {
    if (options.itemCode) params.set('itemCode', options.itemCode)
    if (options.limit) params.set('limit', options.limit)
  }

  params.set('write', options.write ? 'true' : 'false')
  params.set('syncDomains', options.domains.join(','))

  return new EventSource('/api/sync?' + params.toString())
}
