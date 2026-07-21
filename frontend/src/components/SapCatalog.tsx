import { useState, useEffect, useRef } from 'react'
import type { SapArticle, PaginationMeta } from '../types'
import { getSapProducts } from '../api/sap'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'
import { Tag } from './Tag'
import { money, fmt } from '../utils'

type StatusFilter = 'all' | 'active' | 'inactive'
type StockFilter  = 'all' | 'with'   | 'without'

const PAGE_SIZE = 50

interface Props {
  onSyncItem?: (itemCode: string) => void
  syncingItemCode?: string | null
}

export function SapCatalog({ onSyncItem, syncingItemCode }: Props = {}) {
  const [loaded, setLoaded] = useState(false)
  const [items, setItems] = useState<SapArticle[]>([])
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [page, setPage] = useState(1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function fetchPage(params: { page: number; search: string; status: StatusFilter; stock: StockFilter }) {
    setLoading(true)
    setError(null)
    try {
      const data = await getSapProducts({
        page: params.page,
        pageSize: PAGE_SIZE,
        search: params.search || undefined,
        status: params.status,
        stock: params.stock,
      })
      setItems(data.items)
      setPagination(data.pagination)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!loaded) return
    fetchPage({ page, search, status: statusFilter, stock: stockFilter })
  }, [loaded, page, search, statusFilter, stockFilter])

  function startLoad() {
    setLoaded(true)
  }

  function onSearchInput(v: string) {
    setSearchInput(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(v)
      setPage(1)
    }, 350)
  }

  function onStatus(v: StatusFilter) { setStatusFilter(v); setPage(1) }
  function onStock(v: StockFilter)   { setStockFilter(v);  setPage(1) }

  function clearFilters() {
    setSearchInput('')
    setSearch('')
    setStatusFilter('all')
    setStockFilter('all')
    setPage(1)
  }

  if (!loaded) {
    return (
      <div className="card">
        <EmptyState
          icon="○"
          title="Catálogo no cargado"
          description="Cargá la lista de artículos para poder explorar, filtrar y buscar en el catálogo SAP."
          action={{ label: 'Cargar catálogo', onClick: startLoad }}
        />
      </div>
    )
  }

  if (loading && items.length === 0) {
    return (
      <div className="card">
        <div className="catalog-loading-overlay">
          <span className="spinner-dark" />
          Cargando artículos...
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={20} />
          ))}
        </div>
      </div>
    )
  }

  if (error && items.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon="!"
          title="Error al cargar el catálogo"
          description={error}
          action={{ label: 'Reintentar', onClick: () => fetchPage({ page, search, status: statusFilter, stock: stockFilter }) }}
        />
      </div>
    )
  }

  const total = pagination?.total ?? 0
  const totalPages = pagination?.totalPages ?? 1
  const safePage = pagination?.page ?? page
  const pageStart = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(safePage * PAGE_SIZE, total)

  return (
    <>
      <div className="catalog-toolbar">
        <input
          className="catalog-search"
          type="search"
          placeholder="Buscar por código o nombre..."
          value={searchInput}
          onChange={e => onSearchInput(e.target.value)}
        />

        <div className="catalog-filter-group">
          <button type="button" className={statusFilter === 'all'      ? 'active' : ''} onClick={() => onStatus('all')}>Todos</button>
          <button type="button" className={statusFilter === 'active'   ? 'active' : ''} onClick={() => onStatus('active')}>Activos</button>
          <button type="button" className={statusFilter === 'inactive' ? 'active' : ''} onClick={() => onStatus('inactive')}>Inactivos</button>
        </div>

        <div className="catalog-filter-group">
          <button type="button" className={stockFilter === 'all'     ? 'active' : ''} onClick={() => onStock('all')}>Todo stock</button>
          <button type="button" className={stockFilter === 'with'    ? 'active' : ''} onClick={() => onStock('with')}>Con stock</button>
          <button type="button" className={stockFilter === 'without' ? 'active' : ''} onClick={() => onStock('without')}>Sin stock</button>
        </div>

        <button
          className="btn-secondary"
          type="button"
          disabled={loading}
          onClick={() => fetchPage({ page, search, status: statusFilter, stock: stockFilter })}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7 }}
        >
          {loading && <span className="spinner-dark" />}
          {loading ? 'Cargando' : 'Recargar'}
        </button>
      </div>

      <div className="catalog-info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {loading && <span className="spinner-dark" style={{ width: 11, height: 11 }} />}
        {loading
          ? 'Cargando...'
          : total === 0
            ? 'Sin resultados para los filtros aplicados.'
            : `Mostrando ${pageStart}–${pageEnd} de ${fmt(total)} artículo(s)`}
      </div>

      {!loading && total === 0 ? (
        <div className="card">
          <EmptyState
            icon="○"
            title="Sin resultados"
            description="Probá ajustando la búsqueda o los filtros."
            action={{ label: 'Limpiar filtros', onClick: clearFilters }}
          />
        </div>
      ) : (
        <>
          <div className="catalog-table-wrap" style={{ opacity: loading ? 0.5 : 1 }}>
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th>Estado</th>
                  {onSyncItem && <th style={{ width: 80 }} />}
                </tr>
              </thead>
              <tbody>
                {items.map(a => {
                  const inactive = a.status !== 'Y'
                  const zeroStock = (a.stock ?? 0) === 0
                  const isSyncing = syncingItemCode === a.itemCode
                  return (
                    <tr key={a.itemCode} className={inactive ? 'row-inactive' : ''}>
                      <td style={{ fontFamily: 'Consolas, monospace', fontSize: '0.88rem' }}>
                        {a.itemCode ?? '—'}
                      </td>
                      <td>{a.itemName ?? '—'}</td>
                      <td style={{ color: a.category ? undefined : 'var(--muted)', fontSize: '0.85rem' }}>
                        {a.category ?? '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(a.price)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={zeroStock && !inactive ? 'stock-zero' : ''}>
                          {fmt(a.stock) ?? '0'}
                        </span>
                      </td>
                      <td>
                        <Tag tone={inactive ? 'gray' : 'green'}>
                          {inactive ? 'Inactivo' : 'Activo'}
                        </Tag>
                      </td>
                      {onSyncItem && (
                        <td>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '3px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 5 }}
                            disabled={!!syncingItemCode}
                            onClick={() => a.itemCode && onSyncItem(a.itemCode)}
                          >
                            {isSyncing && <span className="spinner-dark" style={{ width: 10, height: 10 }} />}
                            {isSyncing ? 'Sync...' : 'Sync'}
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <div className="section-note">
              {fmt(total)} artículo(s) total
            </div>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn-secondary"
                disabled={!pagination?.hasPreviousPage || loading}
                onClick={() => setPage(p => p - 1)}
              >
                ← Anterior
              </button>
              <span className="pagination-label">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={!pagination?.hasNextPage || loading}
                onClick={() => setPage(p => p + 1)}
              >
                Siguiente →
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
