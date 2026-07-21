import { useState } from 'react'
import type { SapCategoryNode, SapCategoryTree, PsCategory } from '../types'
import { useAppContext } from '../context/AppContext'
import { getSapCategories, getPsCategories } from '../api/sap'
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

function PsCategoryTree({ categories }: { categories: PsCategory[] }) {
  const byId = new Map(categories.map(c => [c.id, c]))
  // Root categories: parentId 0 or 1 (PrestaShop root is id=1, home is id=2)
  const rootIds = new Set(categories.filter(c => c.parentId <= 1).map(c => c.id))
  const childrenOf = new Map<number, PsCategory[]>()
  for (const c of categories) {
    if (!childrenOf.has(c.parentId)) childrenOf.set(c.parentId, [])
    childrenOf.get(c.parentId)!.push(c)
  }

  function Node({ cat, depth }: { cat: PsCategory; depth: number }) {
    const [open, setOpen] = useState(depth < 1)
    const children = childrenOf.get(cat.id) ?? []
    const active = cat.active === '1'
    return (
      <div style={{ marginLeft: depth * 20 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 5, cursor: children.length > 0 ? 'pointer' : 'default' }}
          onClick={() => children.length > 0 && setOpen(o => !o)}
        >
          <span style={{ width: 14, color: 'var(--muted)', fontSize: '0.78rem', flexShrink: 0 }}>
            {children.length > 0 ? (open ? '▾' : '▸') : '·'}
          </span>
          <span style={{ flex: 1, fontSize: '0.91rem', color: active ? undefined : 'var(--muted)' }}>{cat.name || '(sin nombre)'}</span>
          <span className="section-note" style={{ fontSize: '0.78rem' }}>#{cat.id}</span>
          <Tag tone={active ? 'green' : 'gray'}>{active ? 'Activa' : 'Inactiva'}</Tag>
        </div>
        {open && children.length > 0 && (
          <div>
            {children.map(child => <Node key={child.id} cat={child} depth={depth + 1} />)}
          </div>
        )}
      </div>
    )
  }

  const roots = categories.filter(c => rootIds.has(c.id))
  if (roots.length === 0) {
    return <div className="section-note">Sin categorías raíz encontradas.</div>
  }
  return (
    <div>
      {roots.map(cat => <Node key={cat.id} cat={cat} depth={0} />)}
    </div>
  )
}

export function CategoriesView() {
  const { writeMode, syncRunning, setSyncRunning } = useAppContext()

  const [sapTree, setSapTree] = useState<SapCategoryTree | null>(null)
  const [loadingSap, setLoadingSap] = useState(false)
  const [sapError, setSapError] = useState<string | null>(null)

  const [psCategories, setPsCategories] = useState<PsCategory[] | null>(null)
  const [loadingPs, setLoadingPs] = useState(false)
  const [psError, setPsError] = useState<string | null>(null)

  const [log, setLog] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)

  async function loadSapTree() {
    setLoadingSap(true)
    setSapError(null)
    try { setSapTree(await getSapCategories()) }
    catch (err) { setSapError(err instanceof Error ? err.message : String(err)) }
    finally { setLoadingSap(false) }
  }

  async function loadPsCategories() {
    setLoadingPs(true)
    setPsError(null)
    try { setPsCategories(await getPsCategories()) }
    catch (err) { setPsError(err instanceof Error ? err.message : String(err)) }
    finally { setLoadingPs(false) }
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

    const finish = () => {
      es.close()
      setSyncing(false)
      setSyncRunning(false)
    }
    es.addEventListener('done', finish)
    es.onerror = finish
  }

  async function handleStop() {
    try { await stopSync() } catch {}
    setSyncing(false)
    setSyncRunning(false)
  }

  return (
    <main>
      <section className="section">
        {/* Header */}
        <div className="section-header">
          <div>
            <h2 className="section-title">Categorías</h2>
            <div className="section-note">{writeMode ? 'Modo escritura activo' : 'Modo análisis — sin cambios en PrestaShop'}</div>
          </div>
        </div>

        {/* SAP tree */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="section-title" style={{ margin: 0 }}>Árbol SAP</div>
            <button className="btn-secondary" type="button" onClick={loadSapTree} disabled={loadingSap}
              style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {loadingSap && <span className="spinner-dark" />}
              {loadingSap ? 'Cargando...' : sapTree ? 'Recargar' : 'Cargar'}
            </button>
          </div>

          {sapError && <div style={{ color: 'var(--danger)', fontSize: '0.9rem', padding: '4px 0' }}>{sapError}</div>}

          {loadingSap && !sapTree && (
            <div style={{ display: 'grid', gap: 8 }}>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} width="100%" height={28} />)}
            </div>
          )}

          {sapTree && !loadingSap && (
            <>
              <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
                <span className="section-note">Total artículos: <strong>{fmt(sapTree.totalProducts)}</strong></span>
                <span className="section-note">Con categoría: <strong>{fmt(sapTree.categorized)}</strong></span>
                <span className="section-note" style={{ color: sapTree.uncategorized > 0 ? 'var(--warning)' : undefined }}>
                  Sin categoría: <strong>{fmt(sapTree.uncategorized)}</strong>
                </span>
                <span className="section-note">Raíces: <strong>{sapTree.categories.length}</strong></span>
              </div>
              {sapTree.categories.length === 0
                ? <div className="section-note">No se encontraron categorías con U_Categoria definido.</div>
                : (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    {sapTree.categories.map(cat => <CategoryNode key={cat.name} node={cat} depth={0} />)}
                  </div>
                )}
            </>
          )}

          {!sapTree && !loadingSap && !sapError && (
            <div className="section-note" style={{ textAlign: 'center', padding: '20px 0' }}>
              Cargá el árbol para ver las categorías definidas en SAP.
            </div>
          )}
        </div>

        {/* PrestaShop categories */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="section-title" style={{ margin: 0 }}>Categorías PrestaShop</div>
            <button className="btn-secondary" type="button" onClick={loadPsCategories} disabled={loadingPs}
              style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {loadingPs && <span className="spinner-dark" />}
              {loadingPs ? 'Cargando...' : psCategories ? `Recargar (${psCategories.length})` : 'Cargar'}
            </button>
          </div>

          {psError && <div style={{ color: 'var(--danger)', fontSize: '0.9rem', padding: '4px 0' }}>{psError}</div>}

          {loadingPs && !psCategories && (
            <div style={{ display: 'grid', gap: 8 }}>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} width="100%" height={28} />)}
            </div>
          )}

          {psCategories && !loadingPs && (
            <>
              <div style={{ marginBottom: 12 }}>
                <span className="section-note">Total: <strong>{psCategories.length}</strong></span>
                <span className="section-note" style={{ marginLeft: 16 }}>
                  Activas: <strong>{psCategories.filter(c => c.active === '1').length}</strong>
                </span>
                <span className="section-note" style={{ marginLeft: 16 }}>
                  Inactivas: <strong>{psCategories.filter(c => c.active !== '1').length}</strong>
                </span>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <PsCategoryTree categories={psCategories} />
              </div>
            </>
          )}

          {!psCategories && !loadingPs && !psError && (
            <div className="section-note" style={{ textAlign: 'center', padding: '20px 0' }}>
              Cargá las categorías de PrestaShop para comparar con SAP.
            </div>
          )}
        </div>

        {/* Sync action */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Sincronizar categorías SAP → PrestaShop</div>
            <div className="section-note">{writeMode ? 'Aplicará cambios reales en la tienda.' : 'Modo análisis — solo reporta, no modifica nada.'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {syncing ? (
              <button className="btn-secondary" type="button" onClick={handleStop} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className="spinner-dark" />
                Detener
              </button>
            ) : (
              <button className="btn-dark" type="button" onClick={runSync} disabled={syncRunning}>
                {writeMode ? 'Sincronizar categorías' : 'Analizar categorías'}
              </button>
            )}
          </div>
        </div>

        {/* Log */}
        {log.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="section-title" style={{ marginBottom: 8 }}>Log sync</div>
            <div className="log-box">
              {log.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
