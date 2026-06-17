import type { CatalogOverview, DomainAnalysis } from '../types'

export async function getCatalogOverview(forceRefresh = false): Promise<CatalogOverview> {
  const url = '/api/catalog-overview' + (forceRefresh ? '?refresh=true' : '')
  const res = await fetch(url)
  if (!res.ok) throw new Error('Error al cargar catalog-overview: ' + res.status)
  return res.json()
}

export async function getDomainAnalysis(): Promise<DomainAnalysis> {
  const res = await fetch('/api/domain-analysis')
  if (!res.ok) throw new Error('Error al cargar domain-analysis: ' + res.status)
  return res.json()
}
