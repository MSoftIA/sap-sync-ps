import { useEffect, useState, useCallback } from 'react'
import type { View } from './types'
import { AppProvider, useAppContext } from './context/AppContext'
import { ToastProvider } from './context/ToastContext'
import { ToastContainer } from './components/ToastContainer'
import { Sidebar } from './components/Sidebar'
import { SyncView } from './views/SyncView'
import { ProductsView } from './views/ProductsView'
import { CategoriesView } from './views/CategoriesView'
import { getSyncDomains } from './api/sync'

const VALID_VIEWS: View[] = ['sync', 'products', 'categories']

function AppContent() {
  const { currentView, setCurrentView, setAvailableDomains } = useAppContext()
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const domains = await getSyncDomains()
      setAvailableDomains(domains)
    } catch {}
    setLoading(false)
  }, [setAvailableDomains])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Hash routing: read initial hash on mount
  useEffect(() => {
    const hash = window.location.hash.slice(1) as View
    if (VALID_VIEWS.includes(hash)) setCurrentView(hash)
  }, [setCurrentView])

  // Hash routing: keep URL in sync when view changes
  useEffect(() => {
    if (window.location.hash.slice(1) !== currentView) {
      window.location.hash = currentView
    }
  }, [currentView])

  // Hash routing: handle browser back/forward
  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash.slice(1) as View
      if (VALID_VIEWS.includes(hash)) setCurrentView(hash)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [setCurrentView])

  return (
    <div className="layout">
      <div className={`top-loading-bar${loading ? ' visible' : ''}`} />

      <Sidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        loading={loading}
      />

      <div className="main-content">
        {currentView === 'sync' && (
          <SyncView loading={loading} onRefresh={loadAll} />
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
