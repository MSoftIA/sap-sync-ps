import type { SapArticle } from '../types'

export interface SapArticlesResponse {
  total: number
  items: SapArticle[]
}

export async function getSapArticles(): Promise<SapArticlesResponse> {
  const res = await fetch('/api/sap/articles')
  if (!res.ok) throw new Error('Error al cargar artículos SAP: ' + res.status)
  return res.json()
}
