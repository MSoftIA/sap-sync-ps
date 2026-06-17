import type { Report } from '../types'

export async function getReports(): Promise<Report[]> {
  const res = await fetch('/api/reports')
  if (!res.ok) throw new Error('Error al cargar reportes: ' + res.status)
  return res.json()
}
