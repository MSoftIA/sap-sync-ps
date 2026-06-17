import type { PrestaControlResult, PrestaProductSummary } from '../types'

export interface PrestaProductsResponse {
  total: number
  items: PrestaProductSummary[]
}

interface PrestaProductsPageResponse {
  pagination?: {
    total?: number
    hasNextPage?: boolean
  }
  items?: Array<{
    productId?: number
    reference?: string
    active?: '1' | '0'
    productPrice?: number
    stockTotal?: number
    combinationCount?: number
    defaultCategory?: string
  }>
}

export async function getPrestaProducts(): Promise<PrestaProductsResponse> {
  const pageSize = 250
  let page = 1
  let total = 0
  const items: PrestaProductSummary[] = []

  while (true) {
    const res = await fetch(`/api/prestashop-products?page=${page}&pageSize=${pageSize}`)
    if (!res.ok) throw new Error('Error al cargar productos PrestaShop: ' + res.status)

    const data = (await res.json()) as PrestaProductsPageResponse
    const pageItems = (data.items ?? []).map((item) => ({
      productId: Number(item.productId ?? 0),
      reference: item.reference ?? '',
      name: item.reference ?? item.defaultCategory ?? '',
      active: item.active === '0' ? '0' : '1',
      price: Number(item.productPrice ?? 0),
      combinations: Number(item.combinationCount ?? 0),
      stock: Number(item.stockTotal ?? 0),
    }))

    items.push(...pageItems)
    total = Number(data.pagination?.total ?? items.length)

    if (!data.pagination?.hasNextPage) break
    page += 1
  }

  return { total, items }
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
