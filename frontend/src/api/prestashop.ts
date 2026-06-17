import type { PrestaControlResult } from '../types'

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
