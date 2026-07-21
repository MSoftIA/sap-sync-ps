import type { View } from '../types'

interface NavItem {
  key: View
  label: string
  icon: string
}

interface Props {
  currentView: View
  onNavigate: (view: View) => void
  loading?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { key: 'sync',       label: 'Sync',       icon: '⟳' },
  { key: 'products',   label: 'Productos',  icon: '◈' },
  { key: 'categories', label: 'Categorías', icon: '⊙' },
]

export function Sidebar({ currentView, onNavigate, loading }: Props) {

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>SAP Sync</h1>
        <p>Panel operativo</p>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => {
          return (
            <button
              key={item.key}
              className={`nav-item${currentView === item.key ? ' active' : ''}`}
              type="button"
              onClick={() => { onNavigate(item.key); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        {loading && <span className="spinner" style={{ width: 10, height: 10, marginRight: 6 }} />}
        v0.1.0
      </div>
    </aside>
  )
}
