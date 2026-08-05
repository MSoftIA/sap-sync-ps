import { useEffect, useState, useCallback } from "react";
import type { View } from "./types";
import { AppProvider, useAppContext } from "./context/AppContext";
import { ToastProvider } from "./context/ToastContext";
import { ToastContainer } from "./components/ToastContainer";
import { Sidebar } from "./components/Sidebar";
import { SyncView } from "./views/SyncView";
import { ProductsView } from "./views/ProductsView";
import { CategoriesView } from "./views/CategoriesView";
import { MappingView } from "./views/MappingView";
import { AutomationView } from "./views/AutomationView";
import { getSyncDomains } from "./api/sync";

const VALID_VIEWS: View[] = [
  "sync",
  "products",
  "categories",
  "mapping",
  "automation",
];

function AppContent() {
  const { currentView, setCurrentView, setAvailableDomains } = useAppContext();
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const domains = await getSyncDomains();
      setAvailableDomains(domains);
    } catch {}
    setLoading(false);
  }, [setAvailableDomains]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (window.location.hash.slice(1) !== currentView) {
      window.location.hash = currentView;
    }
    const titles: Record<View, string> = {
      sync: "Sincronizar - SAP Sync",
      products: "Productos - SAP Sync",
      categories: "Categorias - SAP Sync",
      mapping: "Mapeo - SAP Sync",
      automation: "Automatizacion - SAP Sync",
    };
    document.title = titles[currentView];
  }, [currentView]);

  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash.slice(1) as View;
      if (VALID_VIEWS.includes(hash)) setCurrentView(hash);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [setCurrentView]);

  return (
    <div className="layout">
      <div className={`top-loading-bar${loading ? " visible" : ""}`} />

      <Sidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        loading={loading}
      />

      <div className="main-content">
        {currentView === "sync" && (
          <SyncView loading={loading} onRefresh={loadAll} />
        )}
        {currentView === "products" && <ProductsView />}
        {currentView === "categories" && <CategoriesView />}
        {currentView === "mapping" && <MappingView />}
        {currentView === "automation" && <AutomationView />}
      </div>

      <ToastContainer />
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ToastProvider>
  );
}
