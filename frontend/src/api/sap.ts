import type { SapArticle, PaginationMeta, SapCategoryTree, PsCategory } from '../types'

export interface SapProductsParams {
  page?: number
  pageSize?: number
  search?: string
  status?: 'all' | 'active' | 'inactive'
  stock?: 'all' | 'with' | 'without'
}

export interface SapProductsResponse {
  pagination: PaginationMeta
  items: SapArticle[]
}

export async function getPsCategories(): Promise<PsCategory[]> {
  const res = await fetch('/api/prestashop-categories')
  if (!res.ok) throw new Error('Error al cargar categorías PrestaShop: ' + res.status)
  const data = await res.json()
  return data.categories ?? []
}

export async function getSapCategories(): Promise<SapCategoryTree> {
  const res = await fetch('/api/sap-categories')
  if (!res.ok) throw new Error('Error al cargar categorías SAP: ' + res.status)
  return res.json()
}

export async function getSapProducts(params: SapProductsParams = {}): Promise<SapProductsResponse> {
  const q = new URLSearchParams()
  if (params.page)     q.set('page', String(params.page))
  if (params.pageSize) q.set('pageSize', String(params.pageSize))
  if (params.search)   q.set('search', params.search)
  if (params.status)   q.set('status', params.status)
  if (params.stock)    q.set('stock', params.stock)
  const res = await fetch('/api/sap-products?' + q)
  if (!res.ok) throw new Error('Error al cargar artículos SAP: ' + res.status)
  return res.json()
}
