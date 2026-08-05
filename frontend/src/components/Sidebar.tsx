import type { ReactNode } from "react";
import type { View } from "../types";

interface NavItem {
  key: View;
  label: string;
  icon: ReactNode;
}

interface Props {
  currentView: View;
  onNavigate: (view: View) => void;
  loading?: boolean;
}

const iconProps = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2.2",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const NAV_ITEMS: NavItem[] = [
  {
    key: "sync",
    label: "Sync",
    icon: (
      <svg {...iconProps}>
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M8 16H3v5" />
      </svg>
    ),
  },
  {
    key: "products",
    label: "Productos",
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    key: "categories",
    label: "Categorias",
    icon: (
      <svg {...iconProps}>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    key: "mapping",
    label: "Mapeo",
    icon: (
      <svg {...iconProps}>
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="M3 6h.01" />
        <path d="M3 12h.01" />
        <path d="M3 18h.01" />
      </svg>
    ),
  },
  {
    key: "automation",
    label: "Automatizacion",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
];

export function Sidebar({ currentView, onNavigate, loading }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>SAP Sync</h1>
        <p>Panel operativo</p>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`nav-item${currentView === item.key ? " active" : ""}`}
            type="button"
            aria-label={item.label}
            onClick={() => {
              onNavigate(item.key);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <span className="nav-item-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        {loading && (
          <span
            className="spinner"
            style={{ width: 10, height: 10, marginRight: 6 }}
          />
        )}
        v0.1.0
      </div>
    </aside>
  );
}
