import { useState, useEffect, useRef } from 'react'
import type { PrestaProductSummary, PaginationMeta } from '../types'
import { getPrestaProducts } from '../api/prestashop'
import { getPsCategories } from '../api/sap'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'
import { Tag } from './Tag'
import { money, fmt } from '../utils'

type StatusFilter = 'all' | 'active' | 'inactive'

const PAGE_SIZE = 50

export function PrestaCatalog() {
  const [loaded, setLoaded] = useState(false)
  const [items, setItems] = useState<PrestaProductSummary[]>([])
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categoryMap, setCategoryMap] = useState<Map<number, string>>(new Map())

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function fetchPage(params: {
    page: number
    search: string
    status: StatusFilter
  }) {
    setLoading(true)
    setError(null)
    try {
      const data = await getPrestaProducts({
        page: params.page,
        pageSize: PAGE_SIZE,
        search: params.search || undefined,
        status: params.status,
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
    fetchPage({ page, search, status: statusFilter })
  }, [loaded, page, search, statusFilter])

  useEffect(() => {
    if (!loaded) return
    getPsCategories()
      .then(cats => setCategoryMap(new Map(cats.map(c => [c.id, c.name]))))
      .catch(() => {})
  }, [loaded])

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

  function onStatus(v: StatusFilter) {
    setStatusFilter(v)
    setPage(1)
  }

  function clearFilters() {
    setSearchInput('')
    setSearch('')
    setStatusFilter('all')
    setPage(1)
  }

  if (!loaded) {
    return (
      <div className="card">
        <EmptyState
          icon="o"
          title="Catalogo no cargado"
          description="Carga la lista de productos para explorar, filtrar y buscar en PrestaShop."
          action={{ label: 'Cargar catalogo', onClick: startLoad }}
        />
      </div>
    )
  }

  if (loading && items.length === 0) {
    return (
      <div className="card">
        <div className="catalog-loading-overlay">
          <span className="spinner-dark" />
          Cargando productos...
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
          title="Error al cargar el catalogo"
          description={error}
          action={{
            label: 'Reintentar',
            onClick: () => fetchPage({ page, search, status: statusFilter }),
          }}
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
          placeholder="Buscar por referencia o nombre..."
          value={searchInput}
          onChange={(e) => onSearchInput(e.target.value)}
        />

        <div className="catalog-filter-group">
          <button
            type="button"
            className={statusFilter === 'all' ? 'active' : ''}
            onClick={() => onStatus('all')}
          >
            Todos
          </button>
          <button
            type="button"
            className={statusFilter === 'active' ? 'active' : ''}
            onClick={() => onStatus('active')}
          >
            Activos
          </button>
          <button
            type="button"
            className={statusFilter === 'inactive' ? 'active' : ''}
            onClick={() => onStatus('inactive')}
          >
            Inactivos
          </button>
        </div>

        <button
          className="btn-secondary"
          type="button"
          disabled={loading}
          onClick={() => fetchPage({ page, search, status: statusFilter })}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7 }}
        >
          {loading && <span className="spinner-dark" />}
          {loading ? 'Cargando' : 'Recargar'}
        </button>
      </div>


      <div
        className="catalog-info"
        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      >
        {loading && <span className="spinner-dark" style={{ width: 11, height: 11 }} />}
        {loading
          ? 'Cargando...'
          : total === 0
            ? 'Sin resultados para los filtros aplicados.'
            : `Mostrando ${pageStart}-${pageEnd} de ${fmt(total)} producto(s)`}
      </div>

      {!loading && total === 0 ? (
        <div className="card">
          <EmptyState
            icon="o"
            title="Sin resultados"
            description="Prueba ajustando la busqueda o los filtros."
            action={{ label: 'Limpiar filtros', onClick: clearFilters }}
          />
        </div>
      ) : (
        <>
          <div className="catalog-table-wrap" style={{ opacity: loading ? 0.5 : 1 }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Referencia</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const inactive = p.active !== '1'
                  const zeroStock = p.stockTotal === 0
                  const catName = p.defaultCategory
                    ? (categoryMap.get(Number(p.defaultCategory)) ?? `#${p.defaultCategory}`)
                    : null

                  return (
                    <tr key={p.productId} className={inactive ? 'row-inactive' : ''}>
                      <td style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                        {p.productId}
                      </td>
                      <td style={{ fontFamily: 'Consolas, monospace', fontSize: '0.88rem' }}>
                        {p.reference || <span style={{ color: 'var(--muted)' }}>-</span>}
                      </td>
                      <td>{p.name || <span style={{ color: 'var(--muted)' }}>-</span>}</td>
                      <td style={{ fontSize: '0.85rem', color: catName ? undefined : 'var(--muted)' }}>
                        {catName ?? '-'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {money(p.productPrice)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={zeroStock && !inactive ? 'stock-zero' : ''}>
                          {fmt(p.stockTotal)}
                        </span>
                      </td>
                      <td>
                        <Tag tone={inactive ? 'gray' : 'green'}>
                          {inactive ? 'Inactivo' : 'Activo'}
                        </Tag>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <div className="section-note">{fmt(total)} producto(s) total</div>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn-secondary"
                disabled={!pagination?.hasPreviousPage || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                {'<-'} Anterior
              </button>
              <span className="pagination-label">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={!pagination?.hasNextPage || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente {'->'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
