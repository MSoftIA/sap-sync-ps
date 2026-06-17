import type { PrestaControlResult, PrestaProductSummary, PaginationMeta } from '../types'

export interface PrestaProductsParams {
  page?: number
  pageSize?: number
  search?: string
  status?: 'all' | 'active' | 'inactive'
  combo?: 'all' | 'simple' | 'combo'
}

export interface PrestaProductsResponse {
  pagination: PaginationMeta
  items: PrestaProductSummary[]
}

export async function getPrestaProducts(params: PrestaProductsParams = {}): Promise<PrestaProductsResponse> {
  const q = new URLSearchParams()
  if (params.page)     q.set('page', String(params.page))
  if (params.pageSize) q.set('pageSize', String(params.pageSize))
  if (params.search)   q.set('search', params.search)
  if (params.status)   q.set('status', params.status)
  if (params.combo)    q.set('combo', params.combo)
  const res = await fetch('/api/prestashop-products?' + q)
  if (!res.ok) throw new Error('Error al cargar productos PrestaShop: ' + res.status)
  return res.json()
}

export async function lookupReference(reference: string): Promise<PrestaControlResult> {
  const res = await fetch('/api/prestashop-control?reference=' + encodeURIComponent(reference))
  if (!res.ok) throw new Error('Error al consultar referencia: ' + res.status)
  return res.json()
}

export async function changeProductStatus(
  productId: number,
  active: boolean,
): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/prestashop-control/active', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, active }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Error al cambiar estado del producto')
  return data
}
