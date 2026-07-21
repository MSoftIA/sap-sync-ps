import type { ScheduleStatus, ScheduleConfig } from '../types'

export async function getSchedule(): Promise<ScheduleStatus> {
  const res = await fetch('/api/schedule')
  if (!res.ok) throw new Error('Error al cargar la configuración del scheduler: ' + res.status)
  return res.json()
}

export async function saveSchedule(config: Partial<ScheduleConfig>): Promise<ScheduleStatus> {
  const res = await fetch('/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) throw new Error('Error al guardar la configuración: ' + res.status)
  return res.json()
}
