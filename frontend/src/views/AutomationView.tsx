import { useState, useEffect, useMemo } from 'react'
import { useAppContext } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { DomainCard } from '../components/DomainCard'
import { getSchedule, saveSchedule } from '../api/schedule'
import type { ScheduleStatus } from '../types'

function formatDatetime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
}

export function AutomationView() {
  const { availableDomains } = useAppContext()
  const { addToast } = useToast()

  const [status, setStatus] = useState<ScheduleStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Config editable local
  const [enabled, setEnabled] = useState(false)
  const [runAt, setRunAt] = useState('02:00')
  const [selectedDomains, setSelectedDomains] = useState<string[]>(['products'])
  const [write, setWrite] = useState(false)

  const visibleDomains = useMemo(
    () => availableDomains.filter(d => d.key !== 'orders'),
    [availableDomains],
  )

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const s = await getSchedule()
      applyStatus(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  function applyStatus(s: ScheduleStatus) {
    setStatus(s)
    setEnabled(s.config.enabled)
    setRunAt(s.config.runAt ?? '02:00')
    setSelectedDomains(s.config.domains)
    setWrite(s.config.write)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await saveSchedule({ enabled, runAt, domains: selectedDomains, write })
      applyStatus(updated)
      addToast({
        message: enabled
          ? `Automatización activada — todos los días a las ${runAt}.`
          : 'Automatización desactivada.',
        kind: 'success',
      })
    } catch (err) {
      addToast({ message: err instanceof Error ? err.message : 'Error al guardar.', kind: 'error' })
    } finally {
      setSaving(false)
    }
  }

  function toggleDomain(key: string, checked: boolean) {
    const next = checked
      ? [...selectedDomains, key]
      : selectedDomains.filter(k => k !== key)
    setSelectedDomains(next.length > 0 ? next : ['products'])
  }

  const lastRunResult = status?.lastRun
    ? status.lastRun.exitCode === 0
      ? { label: 'Exitosa', color: 'var(--success)' }
      : status.lastRun.exitCode === null
        ? { label: 'En curso...', color: 'var(--muted)' }
        : { label: `Con errores (código ${status.lastRun.exitCode})`, color: 'var(--danger)' }
    : null

  return (
    <main>
      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Automatización</h2>
            <div className="section-note">Programa una corrida diaria a una hora fija del servidor.</div>
          </div>
          <button className="btn-secondary" type="button" disabled={loading} onClick={load}
            style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {loading && <span className="spinner-dark" />}
            {loading ? 'Cargando' : 'Recargar'}
          </button>
        </div>

        {/* Tarjeta de estado actual */}
        {status && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 }}>
              <div>
                <div className="section-note" style={{ marginBottom: 6 }}>Estado</div>
                <span className={`status-badge ${status.config.enabled ? 'status-ok' : 'status-warn'}`}>
                  {status.config.enabled ? 'Activo' : 'Inactivo'}
                </span>
                {status.config.enabled && (
                  <div className="section-note" style={{ marginTop: 6 }}>
                    Todos los días a las {status.config.runAt} · {status.config.write ? 'Aplicar cambios' : 'Solo análisis'}
                  </div>
                )}
              </div>

              <div>
                <div className="section-note" style={{ marginBottom: 6 }}>Próxima corrida</div>
                <div style={{ fontWeight: 800 }}>{formatDatetime(status.nextRun)}</div>
              </div>

              <div>
                <div className="section-note" style={{ marginBottom: 6 }}>Última corrida automática</div>
                <div style={{ fontWeight: 800 }}>
                  {formatDatetime(status.lastRun?.finishedAt ?? status.lastRun?.startedAt)}
                </div>
                {lastRunResult && (
                  <div style={{ fontSize: '0.82rem', marginTop: 4, color: lastRunResult.color, fontWeight: 700 }}>
                    {lastRunResult.label}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tarjeta de configuración */}
        <div className="card">
          {loading && !status && (
            <div className="section-note">Cargando configuración...</div>
          )}
          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.9rem', marginBottom: 12 }}>
              {error}
              <button className="btn-secondary" type="button" onClick={load}
                style={{ marginLeft: 12, padding: '4px 10px', fontSize: '0.82rem' }}>
                Reintentar
              </button>
            </div>
          )}

          {(!loading || status) && !error && (
            <div style={{ display: 'grid', gap: 22 }}>

              {/* Activar/desactivar */}
              <div>
                <div className="domain-title" style={{ marginBottom: 8 }}>Activar automatización</div>
                <div className="toggle-group">
                  <button type="button" className={!enabled ? 'active' : ''} onClick={() => setEnabled(false)}>
                    Desactivar
                  </button>
                  <button type="button" className={enabled ? 'active' : ''} onClick={() => setEnabled(true)}>
                    Activar
                  </button>
                </div>
              </div>

              {/* Hora de ejecución */}
              <div>
                <div className="domain-title" style={{ marginBottom: 4 }}>Hora de ejecución</div>
                <div className="section-note" style={{ marginBottom: 10 }}>
                  Hora local del servidor — se ejecutará todos los días a esta hora.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    type="time"
                    value={runAt}
                    onChange={e => setRunAt(e.target.value)}
                    style={{
                      border: '1px solid #cfd8e3',
                      borderRadius: 12,
                      padding: '10px 14px',
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      background: 'white',
                      width: 140,
                    }}
                  />
                  <span className="section-note">hora del servidor</span>
                </div>
              </div>

              {/* Dominios */}
              <div className="domain-picker">
                <div className="domain-header">
                  <div>
                    <div className="domain-title">Dominios</div>
                    <div className="domain-subtitle">Qué sincronizar en cada corrida automática.</div>
                  </div>
                </div>
                <div className="domain-grid">
                  {visibleDomains.length === 0
                    ? <div className="empty">Cargando dominios...</div>
                    : visibleDomains.map(domain => (
                        <DomainCard
                          key={domain.key}
                          domain={domain}
                          checked={selectedDomains.includes(domain.key)}
                          onChange={toggleDomain}
                        />
                      ))
                  }
                </div>
              </div>

              {/* Modo */}
              <div>
                <div className="domain-title" style={{ marginBottom: 8 }}>Modo de ejecución</div>
                <div className="toggle-group">
                  <button type="button" className={!write ? 'active' : ''} onClick={() => setWrite(false)}>
                    Analizar
                  </button>
                  <button type="button" className={write ? 'active danger' : ''} onClick={() => setWrite(true)}>
                    Aplicar cambios
                  </button>
                </div>
                {write && (
                  <div className="section-note" style={{ marginTop: 8, color: 'var(--warning)' }}>
                    Las corridas automáticas aplicarán cambios reales en la tienda sin confirmación.
                  </div>
                )}
              </div>

              {/* Guardar */}
              <div className="button-row">
                <button
                  className="btn-dark"
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  {saving && <span className="spinner" />}
                  {saving ? 'Guardando...' : 'Guardar configuración'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
