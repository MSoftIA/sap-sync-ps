import { useState, useEffect, useRef } from 'react'
import { useAppContext } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { SapCatalog } from '../components/SapCatalog'
import { PrestaCatalog } from '../components/PrestaCatalog'
import { LogBox } from '../components/LogBox'
import type { LogEntry } from '../components/LogBox'
import { Tag } from '../components/Tag'
import { startSyncStream, stopSync } from '../api/sync'

export function ProductsView() {
  const { writeMode, setWriteMode, syncRunning, setSyncRunning } = useAppContext()
  const { addToast } = useToast()
  const [log, setLog] = useState<LogEntry[]>([])
  const [syncing, setSyncing] = useState(false)
  const [stopRequested, setStopRequested] = useState(false)
  const [syncingItemCode, setSyncingItemCode] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  // Close EventSource and reset global syncRunning on unmount
  useEffect(() => {
    return () => {
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
        setSyncRunning(false)
      }
    }
  }, [setSyncRunning])

  function attachHandlers(es: EventSource, label: string, onDone: () => void) {
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data))
        if (msg.type === 'log' && msg.line) {
          try {
            const d = JSON.parse(msg.line)
            const level = String(d.level ?? 'info')
            const cls: LogEntry['cls'] = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'
            setLog(prev => [...prev.slice(-199), { text: `[${level.toUpperCase()}] ${d.message}`, cls }])
          } catch {
            setLog(prev => [...prev.slice(-199), { text: msg.line, cls: 'info' }])
          }
        }
        if (msg.type === 'done') {
          es.close()
          esRef.current = null
          onDone()
          addToast({ message: `${label} completado.`, kind: 'success' })
        }
      } catch {}
    }
    es.onerror = () => {
      es.close()
      esRef.current = null
      onDone()
      addToast({ message: `Error en ${label}.`, kind: 'error' })
    }
  }

  function runSync() {
    if (syncing || syncRunning) return
    setSyncing(true)
    setSyncRunning(true)
    setLog([])

    const es = startSyncStream({ write: writeMode, domains: ['products'], fullCatalog: true })
    esRef.current = es
    attachHandlers(es, 'Sync de productos', () => { setSyncing(false); setSyncRunning(false); setStopRequested(false) })
  }

  async function handleStop() {
    if (stopRequested) return
    setStopRequested(true)
    try { await stopSync() } catch {}
  }

  function syncItem(itemCode: string) {
    if (syncingItemCode || syncRunning) return
    setSyncingItemCode(itemCode)
    setSyncRunning(true)
    setLog([])

    const es = startSyncStream({ write: writeMode, domains: ['products'], itemCode })
    esRef.current = es
    attachHandlers(es, `Sync de ${itemCode}`, () => { setSyncingItemCode(null); setSyncRunning(false); setStopRequested(false) })
  }

  return (
    <main>
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Productos</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="toggle-group">
              <button type="button" className={!writeMode ? 'active' : ''} onClick={() => setWriteMode(false)} disabled={syncing}>Analizar</button>
              <button type="button" className={writeMode ? 'active danger' : ''} onClick={() => setWriteMode(true)} disabled={syncing}>Aplicar cambios</button>
            </div>
            {syncing ? (
              <button className="btn-secondary" type="button" onClick={handleStop} disabled={stopRequested} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {stopRequested && <span className="spinner-dark" />}
                {stopRequested ? 'Deteniendo...' : 'Detener'}
              </button>
            ) : (
              <button className="btn-primary" type="button" onClick={runSync} disabled={syncRunning}>
                {writeMode ? 'Sincronizar productos' : 'Analizar productos'}
              </button>
            )}
          </div>
        </div>

        {log.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="section-title" style={{ marginBottom: 8 }}>Log</div>
            <LogBox entries={log} />
          </div>
        )}

        <div className="section-header" style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="section-title">Catálogo SAP</h2>
            <Tag tone="amber">Origen</Tag>
          </div>
        </div>
        <SapCatalog onSyncItem={writeMode ? syncItem : undefined} syncingItemCode={syncingItemCode} />

        <div className="section-header" style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="section-title">Catálogo PrestaShop</h2>
            <Tag tone="gray">Destino</Tag>
          </div>
        </div>
        <PrestaCatalog />
      </section>
    </main>
  )
}
