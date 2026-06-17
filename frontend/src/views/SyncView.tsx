import { useState, useCallback } from 'react'
import type { Report, DomainAnalysis, SyncProgress } from '../types'
import { useAppContext, defaultProgress } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { DomainCard } from '../components/DomainCard'
import { LogBox } from '../components/LogBox'
import type { LogEntry } from '../components/LogBox'
import { MessageBox } from '../components/MessageBox'
import { ProgressBar } from '../components/ProgressBar'
import { StatusBadge } from '../components/StatusBadge'
import { Tag } from '../components/Tag'
import { BarChart } from '../components/BarChart'
import { ConfirmModal } from '../components/ConfirmModal'
import { EmptyState } from '../components/EmptyState'
import { fmt, fmtDate } from '../utils'
import { startSyncStream } from '../api/sync'

interface Props {
  reports: Report[]
  domainAnalysis: DomainAnalysis | null
  onRefresh: () => void
}

function buildLogDetails(obj: Record<string, unknown>): string {
  const keys = ['itemCode', 'reference', 'productId', 'action', 'status', 'details',
    'payloadSummary', 'sapPrice', 'prestashopProductPrice', 'sapStock', 'childSapLimit', 'effectiveSapLimit']
  const pairs: string[] = []
  for (const key of keys) {
    if (!(key in obj)) continue
    const val = obj[key]
    if (val === undefined || val === null || val === '') continue
    const str = Array.isArray(val) ? val.join(', ') : typeof val === 'object' ? JSON.stringify(val) : String(val)
    if (str) pairs.push(`${key}=${str}`)
  }
  return pairs.length ? ' | ' + pairs.join(' | ') : ''
}

function parseLogLine(raw: string): { text: string; cls: LogEntry['cls']; progress?: SyncProgress } {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    let progress: SyncProgress | undefined
    if (obj.message === 'Progreso de dominio') {
      progress = {
        domain: String(obj.domain ?? ''),
        current: Number(obj.current ?? 0),
        total: Number(obj.total ?? 0),
        percent: Number(obj.percent ?? 0),
        itemCode: String(obj.itemCode ?? ''),
        known: Number.isFinite(Number(obj.total)) && Number(obj.total) > 0,
      }
    }
    const time = obj.ts ? new Date(String(obj.ts)).toLocaleTimeString('es') : ''
    const level = String(obj.level ?? 'info')
    const text = `[${time}] ${level.toUpperCase()} ${String(obj.message ?? raw)}` + buildLogDetails(obj)
    const cls: LogEntry['cls'] = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'
    return { text, cls, progress }
  } catch {
    return { text: raw, cls: 'info' }
  }
}

export function SyncView({ reports, domainAnalysis, onRefresh }: Props) {
  const { writeMode, setWriteMode, syncRunning, setSyncRunning,
    selectedDomains, setSelectedDomains, availableDomains, setCurrentProgress } = useAppContext()
  const { addToast } = useToast()

  const [logEntries, setLogEntries] = useState<LogEntry[]>([])
  const [progress, setProgress] = useState<SyncProgress>(defaultProgress)
  const [statusLabel, setStatusLabel] = useState<string>('Listo')
  const [itemCode, setItemCode] = useState('')
  const [limit, setLimit] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingFullCatalog, setPendingFullCatalog] = useState(false)

  const latest = reports[0] ?? null
  const latestActions = latest?.recommendedActions ?? {}
  const latestSummary = latest?.summary ?? {}
  const updateCount = (latestActions.updateProductPrice ?? 0) +
    (latestActions.updateProductStock ?? 0) +
    (latestActions.updateProductPriceAndStock ?? 0)
  const reviewCount = (latestActions.reviewCombinationMapping ?? 0) + (latestActions.reviewError ?? 0)

  const statusTone = syncRunning ? 'warn'
    : statusLabel === 'Completado' ? 'ok'
    : statusLabel === 'Con errores' ? 'error'
    : writeMode ? 'warn' : 'ok'

  const normalizedDomains = selectedDomains.filter(k => availableDomains.some(d => d.key === k))
  const activeDomains = normalizedDomains.length > 0 ? normalizedDomains : ['products']

  function toggleDomain(key: string, checked: boolean) {
    let next = checked ? [...selectedDomains, key] : selectedDomains.filter(k => k !== key)
    if (next.length === 0) next = ['products']
    setSelectedDomains(next)
  }

  function requestSync(fullCatalog: boolean) {
    if (syncRunning) return
    if (writeMode) {
      setPendingFullCatalog(fullCatalog)
      setShowConfirm(true)
    } else {
      runSync(fullCatalog)
    }
  }

  const runSync = useCallback((fullCatalog = false) => {
    setShowConfirm(false)
    if (syncRunning) return

    setSyncRunning(true)
    setStatusLabel('En ejecución')
    setLogEntries([])
    setProgress(defaultProgress)
    setCurrentProgress(defaultProgress)

    const appendLog = (text: string, cls: LogEntry['cls']) =>
      setLogEntries(prev => [...prev, { text, cls }])

    appendLog(fullCatalog ? 'Iniciando operación principal sobre el catálogo...' : 'Iniciando corrida puntual...', 'info')
    appendLog('Dominios seleccionados: ' + activeDomains.join(', '), 'info')
    appendLog(writeMode ? 'Modo seleccionado: aplicar cambios reales.' : 'Modo seleccionado: analizar sin modificar tienda.', 'info')

    const es = startSyncStream({
      fullCatalog,
      itemCode: fullCatalog ? undefined : itemCode || undefined,
      limit: fullCatalog ? undefined : limit || undefined,
      write: writeMode,
      domains: activeDomains,
    })

    es.onmessage = (event: MessageEvent) => {
      const msg = JSON.parse(String(event.data)) as { type: string; line?: string; code?: number }

      if (msg.type === 'log' && msg.line) {
        const parsed = parseLogLine(msg.line)
        setLogEntries(prev => [...prev, { text: parsed.text, cls: parsed.cls }])
        if (parsed.progress) {
          setProgress(parsed.progress)
          setCurrentProgress(parsed.progress)
        }
        return
      }

      if (msg.type === 'done') {
        const ok = msg.code === 0
        setLogEntries(prev => [...prev, {
          text: ok ? 'Sync completado.' : `Sync finalizo con codigo ${msg.code}.`,
          cls: ok ? 'done-ok' : 'done-err',
        }])
        es.close()
        setSyncRunning(false)
        setStatusLabel(ok ? 'Completado' : 'Con errores')
        if (ok) {
          setProgress(prev => ({ ...prev, percent: 100, known: true }))
          addToast({ message: 'Sync completado exitosamente.', kind: 'success' })
        } else {
          addToast({ message: `Sync finalizo con codigo ${msg.code}. Revisa el log.`, kind: 'error' })
        }
        onRefresh()
      }
    }

    es.onerror = () => {
      setLogEntries(prev => [...prev, { text: 'Error de conexion con el servidor.', cls: 'error' }])
      es.close()
      setSyncRunning(false)
      setStatusLabel('Con errores')
      addToast({ message: 'Error de conexion con el servidor.', kind: 'error' })
    }
  }, [syncRunning, writeMode, activeDomains, itemCode, limit, addToast])

  // Domain analysis data
  const products = domainAnalysis?.domains?.products
  const categories = domainAnalysis?.domains?.categories
  const orders = domainAnalysis?.domains?.orders
  const prodActions = (products?.recommendedActions ?? {}) as typeof latestActions
  const prodSummary = (products?.summary ?? {}) as typeof latestSummary
  const prodUpdate = (prodActions.updateProductPrice ?? 0) + (prodActions.updateProductStock ?? 0) + (prodActions.updateProductPriceAndStock ?? 0)
  const prodReview = (prodActions.reviewCombinationMapping ?? 0) + (prodActions.reviewError ?? 0) + (prodSummary.errors ?? 0)
  const catSummary = (categories?.summary ?? {}) as Record<string, unknown>
  const ordersSummary = orders?.summary as Record<string, unknown> | undefined

  const progressTitle = syncRunning
    ? (progress.domain ? `Dominio ${progress.domain}` : 'Corrida en curso')
    : statusLabel === 'Completado' ? 'Corrida completada'
    : statusLabel === 'Con errores' ? 'Corrida con errores'
    : 'Sin corrida activa'

  const progressMeta = syncRunning
    ? (progress.known ? `${fmt(progress.current)} de ${fmt(progress.total)} (${fmt(progress.percent)}%)` : 'Calculando avance')
    : statusLabel === 'Completado' ? (progress.known ? `${fmt(progress.total)} elemento(s) recorridos` : 'Proceso finalizado')
    : 'Esperando acción'

  const progressNote = syncRunning
    ? (progress.itemCode ? `Procesando item ${progress.itemCode}` : 'Procesando dominio seleccionado')
    : statusLabel === 'Completado' ? 'La operación terminó. Puedes revisar el historial y los reportes generados.'
    : statusLabel === 'Con errores' ? 'Revisa el log para ver en qué punto se cortó y qué dominio estaba activo.'
    : 'Cuando inicies una corrida, aquí verás el dominio actual, el avance y el artículo en proceso cuando aplique.'

  const progressPercent = statusLabel === 'Completado' ? 100 : progress.percent
  const progressKnown = statusLabel === 'Completado' ? true : progress.known

  const hasLastRun = (latestSummary.total ?? 0) > 0
  const chartItems = hasLastRun ? [
    { label: 'Crear', value: latestActions.createProduct ?? 0, color: '#15803d' },
    { label: 'Actualizar', value: updateCount, color: '#b45309' },
    { label: 'Sin cambio', value: latestActions.skipNoChange ?? 0, color: '#667085' },
    { label: 'Revisión', value: reviewCount, color: '#b91c1c' },
  ] : []

  return (
    <main>
      {showConfirm && (
        <ConfirmModal
          domains={activeDomains}
          onConfirm={() => runSync(pendingFullCatalog)}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      <div className="subnav">
        {['sync-summary', 'sync-actions', 'sync-analysis', 'sync-progress', 'sync-logs', 'sync-history'].map((id, i) => (
          <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}>
            {['Resumen', 'Ejecutar', 'Dominios', 'Progreso', 'Logs', 'Historial'][i]}
          </button>
        ))}
      </div>

      {/* Resumen */}
      <section id="sync-summary" className="section">
        {syncRunning && <div className="banner visible">Sync masiva en curso...</div>}

        <div className="sync-hero">
          <div className="hero-panel">
            <div className="card">
              <h2 className="hero-title">Sync masiva</h2>
              <p className="hero-copy">Centro operativo para lanzar la sync y seguir qué está pasando.</p>
              <div className="hero-kpis">
                <div className="hero-kpi">
                  <div className="hero-kpi-label">Modo</div>
                  <div className="hero-kpi-value">{writeMode ? 'Aplicar cambios' : 'Dry run'}</div>
                </div>
                <div className="hero-kpi">
                  <div className="hero-kpi-label">Última muestra</div>
                  <div className="hero-kpi-value">{fmt(latestSummary.total)}</div>
                </div>
                <div className="hero-kpi">
                  <div className="hero-kpi-label">Aplicados</div>
                  <div className="hero-kpi-value">{fmt(latestActions.executed)}</div>
                </div>
                <div className="hero-kpi">
                  <div className="hero-kpi-label">Errores</div>
                  <div className="hero-kpi-value">{fmt(latestSummary.errors)}</div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="summary-grid">
                <div className="metric-card">
                  <div className="label">Estado</div>
                  <StatusBadge tone={statusTone}>{syncRunning ? 'En ejecución' : statusLabel}</StatusBadge>
                  <div className="hint">Situación actual del proceso</div>
                </div>
                <div className="metric-card">
                  <div className="label">Para crear</div>
                  <div className="value">{fmt(latestActions.createProduct)}</div>
                  <div className="hint">Altas detectadas</div>
                </div>
                <div className="metric-card">
                  <div className="label">Para actualizar</div>
                  <div className="value">{fmt(updateCount)}</div>
                  <div className="hint">Precio o stock</div>
                </div>
                <div className="metric-card">
                  <div className="label">Revisión manual</div>
                  <div className="value">{fmt(reviewCount)}</div>
                  <div className="hint">Casos pendientes</div>
                </div>
              </div>

              {hasLastRun && (
                <div style={{ marginTop: 16 }}>
                  <div className="section-note" style={{ marginBottom: 10 }}>Distribución última corrida</div>
                  <BarChart items={chartItems} />
                </div>
              )}
            </div>
          </div>

          <div className="card card-soft">
            <div className="run-facts">
              <div className="fact-row">
                <div className="fact-label">Ultima ejecución</div>
                <div className="fact-value">{fmtDate(latest?.generatedAt)}</div>
              </div>
              <div className="fact-row">
                <div className="fact-label">Lectura del proceso</div>
                <div className="fact-value">
                  {latestSummary.total && latestSummary.total > 0
                    ? `La última ejecución procesó ${latestSummary.total} producto(s).`
                    : 'Sin actividad reciente'}
                </div>
              </div>
              <div className="fact-row">
                <div className="fact-label">Detectados para crear</div>
                <div className="fact-value">{fmt(latestActions.createProduct)}</div>
              </div>
              <div className="fact-row">
                <div className="fact-label">Detectados para actualizar</div>
                <div className="fact-value">{fmt(updateCount)}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ejecutar */}
      <section id="sync-actions" className="section">
        <div className="section-header">
          <h2 className="section-title">Ejecutar</h2>
          <div className="section-note">Elegí dominio y modo.</div>
        </div>

        <div className="card">
          <div className="action-block">
            <MessageBox kind={writeMode ? 'warn' : 'info'}>
              {writeMode
                ? 'Aplicar cambios escribe de verdad en PrestaShop, pero solo en los dominios que ya están listos para escritura.'
                : 'Analizar solo revisa datos, compara y deja reportes. No modifica productos en PrestaShop.'}
            </MessageBox>

            <div className="domain-picker">
              <div className="domain-header">
                <div>
                  <div className="domain-title">Segmentación de sync</div>
                  <div className="domain-subtitle">
                    Elegí desde la interfaz qué dominios quieres correr.
                  </div>
                </div>
                <div className="domain-actions">
                  <button className="btn-secondary" type="button" onClick={() => setSelectedDomains(['products'])}>
                    Solo productos
                  </button>
                  <button className="btn-secondary" type="button" onClick={() => setSelectedDomains(availableDomains.map(d => d.key))}>
                    Todos
                  </button>
                </div>
              </div>

              <div className="domain-grid">
                {availableDomains.length === 0
                  ? <div className="empty">Cargando dominios...</div>
                  : availableDomains.map(domain => (
                    <DomainCard
                      key={domain.key}
                      domain={domain}
                      checked={activeDomains.includes(domain.key)}
                      onChange={toggleDomain}
                    />
                  ))}
              </div>

              <MessageBox kind={activeDomains.length === 0 ? 'warn' : 'info'}>
                {`La próxima corrida usará: ${activeDomains.join(', ')}. ${writeMode ? 'Vas a aplicar cambios reales en los dominios listos.' : 'Vas a analizar sin modificar la tienda.'}`}
              </MessageBox>
            </div>

            <div className="button-row">
              <div className="toggle-group">
                <button
                  className={!writeMode ? 'active' : ''}
                  type="button"
                  onClick={() => setWriteMode(false)}
                >
                  Analizar sin cambios
                </button>
                <button
                  className={writeMode ? 'active danger' : ''}
                  type="button"
                  onClick={() => setWriteMode(true)}
                >
                  Aplicar cambios
                </button>
              </div>

              <button
                className="btn-dark"
                type="button"
                disabled={syncRunning}
                onClick={() => requestSync(true)}
              >
                {writeMode ? 'Sincronizar productos con PrestaShop' : 'Analizar catálogo completo'}
              </button>

              <button
                className="btn-secondary"
                type="button"
                onClick={onRefresh}
              >
                Refrescar tablero
              </button>
            </div>

            <details>
              <summary>Opciones avanzadas y corridas puntuales</summary>
              <div className="details-body">
                <div className="field-grid">
                  <div className="field">
                    <label htmlFor="limit">Lote manual</label>
                    <input type="number" id="limit" min={1} placeholder="Ej. 50"
                      value={limit} onChange={e => setLimit(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="item-code">Item code puntual</label>
                    <input type="text" id="item-code" placeholder="Opcional: un artículo o lote acotado"
                      value={itemCode} onChange={e => setItemCode(e.target.value)} />
                  </div>
                </div>
                <div className="button-row" style={{ marginTop: 12 }}>
                  <button className="btn-primary" type="button" disabled={syncRunning} onClick={() => requestSync(false)}>
                    Ejecutar corrida puntual
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* Dominios */}
      <section id="sync-analysis" className="section">
        <div className="section-header">
          <h2 className="section-title">Dominios</h2>
          <div className="section-note">Estado resumido por área.</div>
        </div>

        <div className="analysis-grid">
          {/* Productos */}
          <div className="analysis-card">
            <div className="analysis-card-header">
              <div>
                <h3 className="analysis-card-title">Productos</h3>
                <div className="analysis-card-copy">Diagnóstico y sincronización de precios, stock, altas y diferencias contra PrestaShop.</div>
              </div>
              {products?.available
                ? <Tag tone={(prodSummary.errors ?? 0) > 0 ? 'red' : 'green'}>{(prodSummary.errors ?? 0) > 0 ? 'Con errores' : 'Disponible'}</Tag>
                : <Tag tone="gray">Sin datos</Tag>}
            </div>
            <div className="analysis-metrics">
              <div className="analysis-metric">
                <div className="analysis-metric-label">Catálogo analizado</div>
                <div className="analysis-metric-value">{fmt(prodSummary.total)}</div>
              </div>
              <div className="analysis-metric">
                <div className="analysis-metric-label">Para crear</div>
                <div className="analysis-metric-value">{fmt(prodActions.createProduct)}</div>
              </div>
              <div className="analysis-metric">
                <div className="analysis-metric-label">Para actualizar</div>
                <div className="analysis-metric-value">{fmt(prodUpdate)}</div>
              </div>
              <div className="analysis-metric">
                <div className="analysis-metric-label">Revisión / errores</div>
                <div className="analysis-metric-value">{fmt(prodReview)}</div>
              </div>
            </div>
            <div className="analysis-card-copy">
              {products?.available && products.generatedAt
                ? 'Último análisis: ' + fmtDate(products.generatedAt)
                : 'Todavía no hay una corrida de análisis de productos.'}
            </div>
          </div>

          {/* Categorías */}
          <div className="analysis-card">
            <div className="analysis-card-header">
              <div>
                <h3 className="analysis-card-title">Categorías</h3>
                <div className="analysis-card-copy">Diagnóstico de categoría principal desde SAP y propiedades activas QryGroup*.</div>
              </div>
              {categories?.available
                ? <Tag tone="amber">{categories.alignment && !categories.alignment.isAligned ? 'Recalcular' : 'Diagnóstico'}</Tag>
                : <Tag tone="gray">Sin datos</Tag>}
            </div>
            <div className="analysis-metrics">
              <div className="analysis-metric">
                <div className="analysis-metric-label">Catálogo evaluado</div>
                <div className="analysis-metric-value">{fmt(catSummary.total)}</div>
              </div>
              <div className="analysis-metric">
                <div className="analysis-metric-label">Categorías SAP únicas</div>
                <div className="analysis-metric-value">{fmt(catSummary.uniqueMainCategories)}</div>
              </div>
              <div className="analysis-metric">
                <div className="analysis-metric-label">Propiedades activas</div>
                <div className="analysis-metric-value">{fmt(catSummary.uniqueActiveProperties)}</div>
              </div>
              <div className="analysis-metric">
                <div className="analysis-metric-label">Sin grupo SAP</div>
                <div className="analysis-metric-value">{fmt(catSummary.rowsWithoutMainCategory)}</div>
              </div>
            </div>
            <div className="analysis-card-copy">
              {categories?.available && categories.alignment && !categories.alignment.isAligned
                ? `El último diagnóstico usó otra base de catálogo (${categories.alignment.reportCatalog} vs ${categories.alignment.expectedOperationalCatalog}). Conviene volver a correr ese análisis.`
                : categories?.available && categories.generatedAt
                ? 'Último diagnóstico: ' + fmtDate(categories.generatedAt)
                : 'Todavía no hay una corrida de análisis de categorías.'}
            </div>
          </div>

          {/* Pedidos */}
          <div className="analysis-card">
            <div className="analysis-card-header">
              <div>
                <h3 className="analysis-card-title">Pedidos</h3>
                <div className="analysis-card-copy">Lectura operativa de pedidos desde SAP para entender volumen, estado y avance.</div>
              </div>
              <Tag tone={orders?.available && orders.summary ? 'green' : 'gray'}>
                {orders?.available && orders.summary ? 'Lectura SAP' : 'Sin datos'}
              </Tag>
            </div>
            <div className="analysis-metrics">
              <div className="analysis-metric">
                <div className="analysis-metric-label">Últimos 30 días</div>
                <div className="analysis-metric-value">{fmt(ordersSummary?.ordersLast30Days)}</div>
              </div>
              <div className="analysis-metric">
                <div className="analysis-metric-label">Abiertos</div>
                <div className="analysis-metric-value">{fmt(ordersSummary?.openOrders)}</div>
              </div>
              <div className="analysis-metric">
                <div className="analysis-metric-label">Cerrados</div>
                <div className="analysis-metric-value">{fmt(ordersSummary?.closedOrders)}</div>
              </div>
              <div className="analysis-metric">
                <div className="analysis-metric-label">Cancelados</div>
                <div className="analysis-metric-value">{fmt(ordersSummary?.canceledOrders)}</div>
              </div>
            </div>
            <div className="analysis-card-copy">
              {orders?.available && ordersSummary
                ? [
                    ordersSummary.latestDocNum ? `Último DocNum ${ordersSummary.latestDocNum}` : null,
                    ordersSummary.latestDocDate ? `fecha ${new Date(String(ordersSummary.latestDocDate)).toLocaleDateString('es')}` : null,
                    ordersSummary.uniqueCustomers !== undefined ? `${ordersSummary.uniqueCustomers} clientes con pedidos` : null,
                  ].filter(Boolean).join(' · ')
                : orders?.note || 'Falta cargar el resumen operativo de pedidos.'}
            </div>
          </div>
        </div>
      </section>

      {/* Progreso */}
      <section id="sync-progress" className="section">
        <div className="section-header">
          <h2 className="section-title">Avance de la corrida</h2>
          <div className="section-note">Qué está corriendo ahora.</div>
        </div>
        <div className="card">
          <ProgressBar
            title={progressTitle}
            meta={progressMeta}
            note={progressNote}
            percent={progressPercent}
            known={progressKnown}
            running={syncRunning}
          />
        </div>
      </section>

      {/* Logs */}
      <section id="sync-logs" className="section">
        <div className="section-header">
          <h2 className="section-title">Log en tiempo real</h2>
          <div className="section-note">Detalle técnico.</div>
        </div>
        <LogBox entries={logEntries} />
      </section>

      {/* Historial */}
      <section id="sync-history" className="section">
        <div className="section-header">
          <h2 className="section-title">Historial de ejecuciones</h2>
          <div className="section-note">La muestra es lo procesado en esa corrida.</div>
        </div>
        {reports.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="○"
              title="Sin corridas registradas"
              description="Ejecuta una sincronización para ver el historial aquí."
              action={{ label: 'Ir a Ejecutar', onClick: () => document.getElementById('sync-actions')?.scrollIntoView({ behavior: 'smooth' }) }}
            />
          </div>
        ) : (
          <div className="history-table">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Muestra</th><th>Crear</th><th>Actualizar</th>
                  <th>Sin cambio</th><th>Revision</th><th>Aplicados</th><th>Errores</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r, i) => {
                  const a = r.recommendedActions ?? {}
                  const s = r.summary ?? {}
                  const upd = (a.updateProductPrice ?? 0) + (a.updateProductStock ?? 0) + (a.updateProductPriceAndStock ?? 0)
                  const rev = (a.reviewCombinationMapping ?? 0) + (a.reviewError ?? 0)
                  const executed = a.executed ?? 0
                  const errors = s.errors ?? 0
                  return (
                    <tr key={i}>
                      <td>{fmtDate(r.generatedAt)}</td>
                      <td>{fmt(s.total)}</td>
                      <td>{fmt(a.createProduct)}</td>
                      <td>{fmt(upd)}</td>
                      <td>{fmt(a.skipNoChange)}</td>
                      <td><Tag tone={rev > 0 ? 'amber' : 'gray'}>{fmt(rev)}</Tag></td>
                      <td><Tag tone={executed > 0 ? 'green' : 'gray'}>{fmt(executed)}</Tag></td>
                      <td><Tag tone={errors > 0 ? 'red' : 'gray'}>{fmt(errors)}</Tag></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
