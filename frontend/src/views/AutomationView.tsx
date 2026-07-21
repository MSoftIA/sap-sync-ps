import { useState, useEffect, useRef, useMemo } from 'react'
import type { SyncProgress } from '../types'
import { useAppContext } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { DomainCard } from '../components/DomainCard'
import { ProgressBar } from '../components/ProgressBar'
import { LogBox } from '../components/LogBox'
import type { LogEntry } from '../components/LogBox'
import { getSchedule, saveSchedule } from '../api/schedule'
import { startSyncStream, stopSync } from '../api/sync'
import { fmt, parseLogLine } from '../utils'
import { defaultProgress } from '../context/AppContext'
import type { ScheduleStatus } from '../types'

function formatDatetime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
}

export function AutomationView() {
  const { availableDomains } = useAppContext()
  const { addToast } = useToast()

  // Schedule status
  const [status, setStatus] = useState<ScheduleStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Config editable local
  const [enabled, setEnabled] = useState(false)
  const [runAt, setRunAt] = useState('02:00')
  const [selectedDomains, setSelectedDomains] = useState<string[]>(['products'])

  // Sync en curso
  const [syncRunning, setSyncRunning] = useState(false)
  const [stopRequested, setStopRequested] = useState(false)
  const [progress, setProgress] = useState<SyncProgress>(defaultProgress)
  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const esRef = useRef<EventSource | null>(null)

  const visibleDomains = useMemo(
    () => availableDomains.filter(d => d.key !== 'orders'),
    [availableDomains],
  )

  // Cerrar SSE al desmontar
  useEffect(() => {
    return () => {
      esRef.current?.close()
      esRef.current = null
    }
  }, [])

  // Cargar configuración al montar
  useEffect(() => { load() }, [])

  // Pollear /api/status cada 5 s para detectar sync en curso
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch('/api/status')
        const data = await res.json() as { running: boolean; source?: string }
        if (data.running && !esRef.current) {
          attachSse()
        }
        if (!data.running && syncRunning) {
          // La sync terminó sin que llegara el evento 'done' (reconexión tardía)
          setSyncRunning(false)
          setStopRequested(false)
          load()
        }
      } catch {}
    }

    checkStatus()
    const id = setInterval(checkStatus, 5000)
    return () => clearInterval(id)
  }, [syncRunning])

  // ── Funciones ───────────────────────────────────────────────────────────────

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
  }

  function attachSse() {
    setSyncRunning(true)
    setStopRequested(false)
    setLogEntries([])
    setProgress(defaultProgress)

    // El servidor ignora los params si hay una sync activa — solo nos adjunta
    const es = startSyncStream({ fullCatalog: true, write: true, domains: ['products'] })
    esRef.current = es

    es.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data)) as {
        type: string; line?: string; code?: number; stopped?: boolean
      }

      if (msg.type === 'log' && msg.line) {
        const parsed = parseLogLine(msg.line)
        setLogEntries(prev => [...prev.slice(-499), { text: parsed.text, cls: parsed.cls }])
        if (parsed.progress) setProgress(parsed.progress)
        return
      }

      if (msg.type === 'done') {
        const ok = msg.code === 0
        const stopped = msg.stopped === true
        setLogEntries(prev => [
          ...prev.slice(-499),
          {
            text: stopped
              ? 'Sync detenida.'
              : ok
                ? 'Sync automática completada.'
                : `Sync finalizó con código ${msg.code}.`,
            cls: stopped || ok ? 'done-ok' : 'done-err',
          },
        ])
        es.close()
        esRef.current = null
        setSyncRunning(false)
        setStopRequested(false)
        if (ok) setProgress(prev => ({ ...prev, percent: 100, known: true }))
        load()
      }
    }

    es.onerror = () => {
      es.close()
      esRef.current = null
      setSyncRunning(false)
      setStopRequested(false)
    }
  }

  async function handleStop() {
    if (!syncRunning || stopRequested) return
    setStopRequested(true)
    try {
      await stopSync()
      addToast({ message: 'Se envió la solicitud para detener la sync.', kind: 'info' })
    } catch (err) {
      setStopRequested(false)
      addToast({ message: err instanceof Error ? err.message : 'No se pudo detener.', kind: 'error' })
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await saveSchedule({ enabled, runAt, domains: selectedDomains, write: true })
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

  // ── Datos derivados para ProgressBar ────────────────────────────────────────

  const progressTitle = progress.domain ? `Dominio ${progress.domain}` : 'Corrida en curso'
  const progressMeta = progress.known
    ? `${fmt(progress.current)} de ${fmt(progress.total)} (${fmt(progress.percent)}%)`
    : 'Calculando avance'
  const progressNote = progress.itemCode
    ? `Procesando ${progress.itemCode}`
    : 'Procesando dominio seleccionado'

  const lastRunResult = status?.lastRun
    ? status.lastRun.exitCode === 0
      ? { label: 'Exitosa', color: 'var(--success)' }
      : status.lastRun.exitCode === null
        ? { label: 'En curso...', color: 'var(--muted)' }
        : { label: `Con errores (código ${status.lastRun.exitCode})`, color: 'var(--danger)' }
    : null

  // ── Render ──────────────────────────────────────────────────────────────────

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

        {/* ── Corrida en curso ── */}
        {syncRunning && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: 2 }}>
                  Corrida automática en curso
                </div>
                <div className="section-note">
                  Iniciada a las {formatDatetime(status?.lastRun?.startedAt)}
                </div>
              </div>
              <button
                className="btn-secondary"
                type="button"
                disabled={stopRequested}
                onClick={handleStop}
                style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}
              >
                {stopRequested && <span className="spinner-dark" />}
                {stopRequested ? 'Deteniendo...' : 'Detener'}
              </button>
            </div>

            <ProgressBar
              title={progressTitle}
              meta={progressMeta}
              note={progressNote}
              percent={progress.percent}
              known={progress.known}
              running={syncRunning}
            />

            {logEntries.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <LogBox entries={logEntries} />
              </div>
            )}
          </div>
        )}

        {/* ── Estado ── */}
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
                    Todos los días a las {status.config.runAt}
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

        {/* ── Configuración ── */}
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

              {/* Hora */}
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
                      border: '1px solid #cfd8e3', borderRadius: 12,
                      padding: '10px 14px', fontSize: '1.05rem', fontWeight: 700,
                      background: 'white', width: 140,
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
