import { useState, useEffect, useRef } from 'react'
import { useAppContext } from '../context/AppContext'
import { SapCatalog } from '../components/SapCatalog'
import { PrestaCatalog } from '../components/PrestaCatalog'
import { startSyncStream, stopSync } from '../api/sync'

export function ProductsView() {
  const { writeMode, setWriteMode, syncRunning, setSyncRunning } = useAppContext()
  const [log, setLog] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)
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

  function attachHandlers(es: EventSource, onDone: () => void) {
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data))
        if (msg.type === 'log' && msg.line) {
          try {
            const d = JSON.parse(msg.line)
            setLog(prev => [...prev.slice(-199), `[${String(d.level ?? 'info').toUpperCase()}] ${d.message}`])
          } catch {
            setLog(prev => [...prev.slice(-199), msg.line])
          }
        }
        if (msg.type === 'done') {
          es.close()
          esRef.current = null
          onDone()
        }
      } catch {}
    }
    es.onerror = () => {
      es.close()
      esRef.current = null
      onDone()
    }
  }

  function runSync() {
    if (syncing || syncRunning) return
    setSyncing(true)
    setSyncRunning(true)
    setLog([])

    const es = startSyncStream({ write: writeMode, domains: ['products'], fullCatalog: true })
    esRef.current = es
    attachHandlers(es, () => { setSyncing(false); setSyncRunning(false) })
  }

  async function handleStop() {
    try { await stopSync() } catch {}
  }

  function syncItem(itemCode: string) {
    if (syncingItemCode || syncRunning) return
    setSyncingItemCode(itemCode)
    setSyncRunning(true)
    setLog([])

    const es = startSyncStream({ write: writeMode, domains: ['products'], itemCode })
    esRef.current = es
    attachHandlers(es, () => { setSyncingItemCode(null); setSyncRunning(false) })
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
              <button className="btn-secondary" type="button" onClick={handleStop} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className="spinner-dark" />
                Detener
              </button>
            ) : (
              <button className="btn-primary" type="button" onClick={runSync} disabled={syncRunning}>
                {writeMode ? 'Sincronizar productos' : 'Analizar productos'}
              </button>
            )}
          </div>
        </div>

        <div className="section-header" style={{ marginTop: 24 }}>
          <h2 className="section-title">SAP</h2>
        </div>
        <SapCatalog onSyncItem={syncItem} syncingItemCode={syncingItemCode} />

        <div className="section-header" style={{ marginTop: 24 }}>
          <h2 className="section-title">PrestaShop</h2>
        </div>
        <PrestaCatalog />

        {log.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="section-title" style={{ marginBottom: 8 }}>Log</div>
            <div className="log-box">
              {log.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
