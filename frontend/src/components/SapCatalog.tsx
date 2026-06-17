import { useState, useMemo } from 'react'
import type { SapArticle } from '../types'
import { getSapArticles } from '../api/sap'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'
import { Tag } from './Tag'
import { money, fmt } from '../utils'

type StatusFilter = 'all' | 'active' | 'inactive'
type StockFilter  = 'all' | 'with'   | 'without'

const PAGE_SIZE = 50

export function SapCatalog() {
  const [articles, setArticles] = useState<SapArticle[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [page, setPage] = useState(1)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await getSapArticles()
      setArticles(data.items)
      setPage(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!articles) return []
    const q = search.trim().toLowerCase()
    return articles.filter(a => {
      if (q && !String(a.itemCode ?? '').toLowerCase().includes(q) && !String(a.itemName ?? '').toLowerCase().includes(q)) return false
      if (statusFilter === 'active'   && a.status !== 'Y') return false
      if (statusFilter === 'inactive' && a.status === 'Y') return false
      if (stockFilter  === 'with'    && (a.stock ?? 0) <= 0) return false
      if (stockFilter  === 'without' && (a.stock ?? 0) >  0) return false
      return true
    })
  }, [articles, search, statusFilter, stockFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function onSearch(v: string) { setSearch(v); setPage(1) }
  function onStatus(v: StatusFilter) { setStatusFilter(v); setPage(1) }
  function onStock(v: StockFilter)   { setStockFilter(v);  setPage(1) }

  if (!articles && !loading && !error) {
    return (
      <div className="card">
        <EmptyState
          icon="○"
          title="Catálogo no cargado"
          description="Cargá la lista de artículos para poder explorar, filtrar y buscar en el catálogo SAP."
          action={{ label: 'Cargar catálogo', onClick: load }}
        />
      </div>
    )
  }

  if (loading) {
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

  if (error) {
    return (
      <div className="card">
        <EmptyState
          icon="!"
          title="Error al cargar el catálogo"
          description={error}
          action={{ label: 'Reintentar', onClick: load }}
        />
      </div>
    )
  }

  return (
    <>
      <div className="catalog-toolbar">
        <input
          className="catalog-search"
          type="search"
          placeholder="Buscar por código o nombre..."
          value={search}
          onChange={e => onSearch(e.target.value)}
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

        <button className="btn-secondary" type="button" onClick={load} style={{ flexShrink: 0 }}>
          Recargar
        </button>
      </div>

      <div className="catalog-info">
        {filtered.length === 0
          ? 'Sin resultados para los filtros aplicados.'
          : `Mostrando ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)} de ${fmt(filtered.length)} artículo(s)${filtered.length < (articles?.length ?? 0) ? ` (filtrado de ${fmt(articles?.length)})` : ''}`}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="○"
            title="Sin resultados"
            description="Probá ajustando la búsqueda o los filtros."
            action={{ label: 'Limpiar filtros', onClick: () => { setSearch(''); setStatusFilter('all'); setStockFilter('all') } }}
          />
        </div>
      ) : (
        <>
          <div className="catalog-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(a => {
                  const inactive = a.status !== 'Y'
                  const zeroStock = (a.stock ?? 0) === 0
                  return (
                    <tr key={a.itemCode} className={inactive ? 'row-inactive' : ''}>
                      <td style={{ fontFamily: 'Consolas, monospace', fontSize: '0.88rem' }}>
                        {a.itemCode ?? '—'}
                      </td>
                      <td>{a.itemName ?? '—'}</td>
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
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <div className="section-note">
              {fmt(filtered.length)} artículo(s) total
            </div>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn-secondary"
                disabled={safePage <= 1}
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
                disabled={safePage >= totalPages}
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
