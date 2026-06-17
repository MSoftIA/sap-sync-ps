import type { SapArticle } from '../types'

export interface SapArticlesResponse {
  total: number
  items: SapArticle[]
}

interface SapProductsPageResponse {
  pagination?: {
    total?: number
    hasNextPage?: boolean
  }
  items?: Array<{
    itemCode?: string
    itemName?: string
    price?: number
    stock?: number
    status?: string
  }>
}

export async function getSapArticles(): Promise<SapArticlesResponse> {
  const pageSize = 250
  let page = 1
  let total = 0
  const items: SapArticle[] = []

  while (true) {
    const res = await fetch(`/api/sap-products?page=${page}&pageSize=${pageSize}`)
    if (!res.ok) throw new Error('Error al cargar articulos SAP: ' + res.status)

    const data = (await res.json()) as SapProductsPageResponse
    const pageItems = (data.items ?? []).map((item) => ({
      itemCode: item.itemCode ?? '',
      itemName: item.itemName ?? '',
      price: Number(item.price ?? 0),
      stock: Number(item.stock ?? 0),
      status: item.status ?? '',
    }))

    items.push(...pageItems)
    total = Number(data.pagination?.total ?? items.length)

    if (!data.pagination?.hasNextPage) break
    page += 1
  }

  return { total, items }
}
