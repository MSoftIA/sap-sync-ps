import { useState } from 'react'
import { useAppContext } from '../context/AppContext'
import { SapCatalog } from '../components/SapCatalog'
import { PrestaCatalog } from '../components/PrestaCatalog'
import { startSyncStream, stopSync } from '../api/sync'

export function ProductsView() {
  const { writeMode, syncRunning, setSyncRunning } = useAppContext()
  const [log, setLog] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncingItemCode, setSyncingItemCode] = useState<string | null>(null)

  function runSync() {
    if (syncing) return
    setSyncing(true)
    setSyncRunning(true)
    setLog([])

    const es = startSyncStream({ write: writeMode, domains: ['products'], fullCatalog: true })

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
        if (msg.type === 'done') { es.close(); setSyncing(false); setSyncRunning(false) }
      } catch {}
    }
    es.onerror = () => { es.close(); setSyncing(false); setSyncRunning(false) }
  }

  async function handleStop() {
    try { await stopSync() } catch {}
    setSyncing(false)
    setSyncRunning(false)
  }

  function syncItem(itemCode: string) {
    if (syncingItemCode || syncRunning) return
    setSyncingItemCode(itemCode)
    setSyncRunning(true)
    setLog([])

    const es = startSyncStream({ write: writeMode, domains: ['products'], itemCode })

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
        if (msg.type === 'done') { es.close(); setSyncingItemCode(null); setSyncRunning(false) }
      } catch {}
    }
    es.onerror = () => { es.close(); setSyncingItemCode(null); setSyncRunning(false) }
  }

  return (
    <main>
      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Productos</h2>
            <div className="section-note">{writeMode ? 'Modo escritura activo' : 'Modo análisis — sin cambios en PrestaShop'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {syncing ? (
              <button className="btn-secondary" type="button" onClick={handleStop} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className="spinner-dark" />
                Detener
              </button>
            ) : (
              <button
                className="btn-primary"
                type="button"
                onClick={runSync}
                disabled={syncRunning}
              >
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
