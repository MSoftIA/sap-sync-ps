import { useEffect, useState, useCallback } from 'react'
import type { CatalogOverview, Report, DomainAnalysis } from './types'
import { AppProvider, useAppContext } from './context/AppContext'
import { ToastProvider } from './context/ToastContext'
import { ToastContainer } from './components/ToastContainer'
import { Sidebar } from './components/Sidebar'
import { SyncView } from './views/SyncView'
import { ProductsView } from './views/ProductsView'
import { CategoriesView } from './views/CategoriesView'
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
  const [loadingAll, setLoadingAll] = useState(true)

  const loadAll = useCallback(async (forceRefresh = false) => {
    setLoadingAll(true)
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

    setLoadingAll(false)
  }, [setAvailableDomains])

  useEffect(() => {
    loadAll(false)
  }, [loadAll])

  const latestActions = reports[0]?.recommendedActions ?? {}
  const syncBadge = latestActions.createProduct ?? 0

  return (
    <div className="layout">
      <div className={`top-loading-bar${loadingAll ? ' visible' : ''}`} />

      <Sidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        lastRunLabel={lastRunLabel}
        overviewLabel={overviewLabel}
        loading={loadingAll}
        badges={{ sync: syncBadge }}
      />

      <div className="main-content">
        {currentView === 'sync' && (
          <SyncView
            reports={reports}
            domainAnalysis={domainAnalysis}
            loading={loadingAll}
            onRefresh={() => loadAll(true)}
          />
        )}
        {currentView === 'products' && <ProductsView />}
        {currentView === 'categories' && <CategoriesView />}
      </div>

      <ToastContainer />
    </div>
  )
}

export function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ToastProvider>
  )
}
