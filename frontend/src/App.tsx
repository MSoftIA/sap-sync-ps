import { useEffect, useState, useCallback } from 'react'
import type { CatalogOverview, Report, DomainAnalysis } from './types'
import { AppProvider, useAppContext } from './context/AppContext'
import { SyncView } from './views/SyncView'
import { SapView } from './views/SapView'
import { PrestaView } from './views/PrestaView'
import { getCatalogOverview, getDomainAnalysis } from './api/catalog'
import { getReports } from './api/reports'
import { getSyncDomains } from './api/sync'
import { fmtDate } from './utils'

function AppContent() {
  const { currentView, setCurrentView, setAvailableDomains } = useAppContext()

  const [overview, setOverview] = useState<CatalogOverview | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [domainAnalysis, setDomainAnalysis] = useState<DomainAnalysis | null>(null)
  const [overviewLabel, setOverviewLabel] = useState('Sin snapshot')
  const [lastRunLabel, setLastRunLabel] = useState('Sin reportes')

  const loadAll = useCallback(async (forceRefresh = false) => {
    setOverviewLabel('Actualizando...')

    const results = await Promise.allSettled([
      getCatalogOverview(forceRefresh),
      getReports(),
      getDomainAnalysis(),
      getSyncDomains(),
    ])

    if (results[0].status === 'fulfilled') {
      const ov = results[0].value
      setOverview(ov)
      const sap = ov.sap
      const ps = ov.prestashop
      const errors = [sap?.error, ps?.error].filter(Boolean)
      setOverviewLabel(errors.length > 0 ? 'Parcial: ' + errors.join(' | ') : fmtDate(ov.generatedAt))
    } else {
      setOverviewLabel('No pude cargar el overview')
    }

    if (results[1].status === 'fulfilled') {
      const reps = results[1].value
      setReports(reps)
      if (reps[0]?.generatedAt) setLastRunLabel(fmtDate(reps[0].generatedAt))
    }

    if (results[2].status === 'fulfilled') {
      setDomainAnalysis(results[2].value)
    }

    if (results[3].status === 'fulfilled') {
      setAvailableDomains(results[3].value)
    }
  }, [setAvailableDomains])

  useEffect(() => {
    loadAll(false)
  }, [loadAll])

  return (
    <div className="page">
      {/* TopBar */}
      <section className="topbar">
        <div className="title">
          <h1>SAP to PrestaShop Sync</h1>
          <p>Tablero operativo para seguir la sync masiva y detectar dónde se traba.</p>
        </div>
        <div className="topbar-meta">
          <div>Ultimo reporte: <strong>{lastRunLabel}</strong></div>
          <div>Catalogo: <strong>{overviewLabel}</strong></div>
        </div>
      </section>

      {/* AppNav */}
      <nav className="app-nav">
        <div className="app-nav-group">
          {(['sync', 'sap', 'presta'] as const).map((view, i) => (
            <button
              key={view}
              className={currentView === view ? 'active' : ''}
              type="button"
              onClick={() => { setCurrentView(view); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            >
              {['Sync', 'SAP', 'PrestaShop'][i]}
            </button>
          ))}
        </div>
        <div className="app-nav-group">
          <button type="button" onClick={() => loadAll(true)}>Refrescar</button>
        </div>
      </nav>

      {/* Vistas */}
      {currentView === 'sync' && (
        <SyncView
          reports={reports}
          domainAnalysis={domainAnalysis}
          onRefresh={() => loadAll(true)}
        />
      )}
      {currentView === 'sap' && <SapView overview={overview} />}
      {currentView === 'presta' && <PrestaView overview={overview} />}
    </div>
  )
}

export function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
