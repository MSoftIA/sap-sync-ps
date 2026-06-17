import { useState, useEffect, useRef } from 'react'
import type { PrestaProductSummary, PaginationMeta } from '../types'
import { getPrestaProducts } from '../api/prestashop'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'
import { Tag } from './Tag'
import { money, fmt } from '../utils'

type StatusFilter = 'all' | 'active' | 'inactive'
type TypeFilter   = 'all' | 'simple' | 'combo'

const PAGE_SIZE = 50

export function PrestaCatalog() {
  const [loaded, setLoaded] = useState(false)
  const [items, setItems] = useState<PrestaProductSummary[]>([])
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [page, setPage] = useState(1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function fetchPage(params: { page: number; search: string; status: StatusFilter; combo: TypeFilter }) {
    setLoading(true)
    setError(null)
    try {
      const data = await getPrestaProducts({
        page: params.page,
        pageSize: PAGE_SIZE,
        search: params.search || undefined,
        status: params.status,
        combo: params.combo,
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
    fetchPage({ page, search, status: statusFilter, combo: typeFilter })
  }, [loaded, page, search, statusFilter, typeFilter])

  function startLoad() { setLoaded(true) }

  function onSearchInput(v: string) {
    setSearchInput(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(v)
      setPage(1)
    }, 350)
  }

  function onStatus(v: StatusFilter) { setStatusFilter(v); setPage(1) }
  function onType(v: TypeFilter)     { setTypeFilter(v);   setPage(1) }

  function clearFilters() {
    setSearchInput('')
    setSearch('')
    setStatusFilter('all')
    setTypeFilter('all')
    setPage(1)
  }

  if (!loaded) {
    return (
      <div className="card">
        <EmptyState
          icon="○"
          title="Catálogo no cargado"
          description="Cargá la lista de productos para explorar, filtrar y buscar en PrestaShop."
          action={{ label: 'Cargar catálogo', onClick: startLoad }}
        />
      </div>
    )
  }

  if (loading && items.length === 0) {
    return (
      <div className="card">
        <div style={{ display: 'grid', gap: 10 }}>
          {Array.from({ length: 12 }).map((_, i) => (
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
          action={{ label: 'Reintentar', onClick: () => fetchPage({ page, search, status: statusFilter, combo: typeFilter }) }}
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
          onChange={e => onSearchInput(e.target.value)}
        />

        <div className="catalog-filter-group">
          <button type="button" className={statusFilter === 'all'      ? 'active' : ''} onClick={() => onStatus('all')}>Todos</button>
          <button type="button" className={statusFilter === 'active'   ? 'active' : ''} onClick={() => onStatus('active')}>Activos</button>
          <button type="button" className={statusFilter === 'inactive' ? 'active' : ''} onClick={() => onStatus('inactive')}>Inactivos</button>
        </div>

        <div className="catalog-filter-group">
          <button type="button" className={typeFilter === 'all'    ? 'active' : ''} onClick={() => onType('all')}>Todos</button>
          <button type="button" className={typeFilter === 'simple' ? 'active' : ''} onClick={() => onType('simple')}>Simples</button>
          <button type="button" className={typeFilter === 'combo'  ? 'active' : ''} onClick={() => onType('combo')}>Con combinaciones</button>
        </div>

        <button className="btn-secondary" type="button" onClick={() => fetchPage({ page, search, status: statusFilter, combo: typeFilter })} style={{ flexShrink: 0 }}>
          {loading ? '...' : 'Recargar'}
        </button>
      </div>

      <div className="catalog-info">
        {loading
          ? 'Cargando...'
          : total === 0
            ? 'Sin resultados para los filtros aplicados.'
            : `Mostrando ${pageStart}–${pageEnd} de ${fmt(total)} producto(s)`}
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
                  <th>ID</th>
                  <th>Referencia</th>
                  <th>Nombre</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.map(p => {
                  const inactive  = p.active !== '1'
                  const hasCombo  = p.hasCombinations
                  const zeroStock = p.stockTotal === 0
                  return (
                    <tr key={p.productId} className={inactive ? 'row-inactive' : ''}>
                      <td style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{p.productId}</td>
                      <td style={{ fontFamily: 'Consolas, monospace', fontSize: '0.88rem' }}>
                        {p.reference || <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td>{p.name || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(p.productPrice)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {hasCombo
                          ? <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>ver combos</span>
                          : <span className={zeroStock && !inactive ? 'stock-zero' : ''}>{fmt(p.stockTotal)}</span>
                        }
                      </td>
                      <td>
                        {hasCombo
                          ? <Tag tone="amber">{p.combinationCount} combos</Tag>
                          : <Tag tone="gray">Simple</Tag>}
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
            <div className="section-note">
              {fmt(total)} producto(s) total
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
