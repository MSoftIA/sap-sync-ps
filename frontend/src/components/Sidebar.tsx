import type { View } from '../types'

interface NavItem {
  key: View
  label: string
  icon: string
  badge?: number
}

interface Props {
  currentView: View
  onNavigate: (view: View) => void
  lastRunLabel: string
  overviewLabel: string
  badges: { sync?: number }
}

const NAV_ITEMS: Omit<NavItem, 'badge'>[] = [
  { key: 'sync',  label: 'Sync',        icon: '⟳' },
  { key: 'sap',   label: 'SAP',         icon: '◈' },
  { key: 'presta', label: 'PrestaShop', icon: '⊙' },
]

export function Sidebar({ currentView, onNavigate, lastRunLabel, overviewLabel, badges }: Props) {
  const badgeMap: Record<View, number | undefined> = {
    sync: badges.sync,
    sap: undefined,
    presta: undefined,
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>SAP Sync</h1>
        <p>Panel operativo</p>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => {
          const badge = badgeMap[item.key]
          return (
            <button
              key={item.key}
              className={`nav-item${currentView === item.key ? ' active' : ''}`}
              type="button"
              onClick={() => { onNavigate(item.key); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {badge != null && badge > 0 && (
                <span className="nav-badge">{badge}</span>
              )}
            </button>
          )
        })}
      </nav>

      <hr className="sidebar-divider" />

      <div className="sidebar-meta">
        <div>Ultimo reporte</div>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>{lastRunLabel}</div>
        <div style={{ marginTop: 6 }}>Catalogo</div>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>{overviewLabel}</div>
      </div>

      <div className="sidebar-footer">v0.1.0</div>
    </aside>
  )
}
