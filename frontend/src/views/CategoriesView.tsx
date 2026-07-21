import { useState } from 'react'
import type { SapCategoryNode, SapCategoryTree } from '../types'
import { useAppContext } from '../context/AppContext'
import { getSapCategories } from '../api/sap'
import { startSyncStream, stopSync } from '../api/sync'
import { Tag } from '../components/Tag'
import { Skeleton } from '../components/Skeleton'
import { fmt } from '../utils'

function CategoryNode({ node, depth = 0 }: { node: SapCategoryNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 1)
  const hasChildren = node.children.length > 0

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 5, cursor: hasChildren ? 'pointer' : 'default' }}
        onClick={() => hasChildren && setOpen(o => !o)}
      >
        <span style={{ width: 14, color: 'var(--muted)', fontSize: '0.78rem', flexShrink: 0 }}>
          {hasChildren ? (open ? '▾' : '▸') : '·'}
        </span>
        <span style={{ flex: 1, fontSize: '0.91rem' }}>{node.name}</span>
        <Tag tone="gray">{fmt(node.total)}</Tag>
      </div>
      {open && hasChildren && (
        <div>
          {node.children.map(child => (
            <CategoryNode key={child.name} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function CategoriesView() {
  const { writeMode, syncRunning, setSyncRunning } = useAppContext()
  const [tree, setTree] = useState<SapCategoryTree | null>(null)
  const [loadingTree, setLoadingTree] = useState(false)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)

  async function loadTree() {
    setLoadingTree(true)
    setTreeError(null)
    try {
      const data = await getSapCategories()
      setTree(data)
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingTree(false)
    }
  }

  function runSync() {
    if (syncing) return
    setSyncing(true)
    setSyncRunning(true)
    setLog([])

    const es = startSyncStream({ write: writeMode, domains: ['categories'], fullCatalog: true })

    es.addEventListener('log', (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data)
        setLog(prev => [...prev.slice(-199), `[${d.level?.toUpperCase() ?? 'INFO'}] ${d.message}`])
      } catch {}
    })

    es.addEventListener('done', () => {
      es.close()
      setSyncing(false)
      setSyncRunning(false)
    })

    es.onerror = () => {
      es.close()
      setSyncing(false)
      setSyncRunning(false)
    }
  }

  async function handleStop() {
    try { await stopSync() } catch {}
    setSyncing(false)
    setSyncRunning(false)
  }

  return (
    <main>
      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Categorías</h2>
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
                {writeMode ? 'Sincronizar categorías' : 'Analizar categorías'}
              </button>
            )}
          </div>
        </div>

        {/* SAP category tree */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="section-title" style={{ margin: 0 }}>Árbol de categorías SAP</div>
            <button
              className="btn-secondary"
              type="button"
              onClick={loadTree}
              disabled={loadingTree}
              style={{ display: 'flex', alignItems: 'center', gap: 7 }}
            >
              {loadingTree && <span className="spinner-dark" />}
              {loadingTree ? 'Cargando...' : tree ? 'Recargar' : 'Cargar árbol'}
            </button>
          </div>

          {treeError && (
            <div style={{ color: 'var(--danger)', fontSize: '0.9rem', padding: '8px 0' }}>{treeError}</div>
          )}

          {loadingTree && !tree && (
            <div style={{ display: 'grid', gap: 8 }}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} width="100%" height={28} />)}
            </div>
          )}

          {tree && !loadingTree && (
            <>
              <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
                <span className="section-note">Total artículos: <strong>{fmt(tree.totalProducts)}</strong></span>
                <span className="section-note">Con categoría: <strong>{fmt(tree.categorized)}</strong></span>
                <span className="section-note" style={{ color: tree.uncategorized > 0 ? 'var(--warning)' : undefined }}>
                  Sin categoría: <strong>{fmt(tree.uncategorized)}</strong>
                </span>
                <span className="section-note">Raíces: <strong>{tree.categories.length}</strong></span>
              </div>

              {tree.categories.length === 0 ? (
                <div className="section-note">No se encontraron categorías con U_Categoria definido.</div>
              ) : (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  {tree.categories.map(cat => (
                    <CategoryNode key={cat.name} node={cat} depth={0} />
                  ))}
                </div>
              )}
            </>
          )}

          {!tree && !loadingTree && !treeError && (
            <div className="section-note" style={{ textAlign: 'center', padding: '24px 0' }}>
              Cargá el árbol para ver las categorías definidas en SAP.
            </div>
          )}
        </div>

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
