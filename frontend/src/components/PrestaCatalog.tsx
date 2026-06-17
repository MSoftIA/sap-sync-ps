import { useState, useMemo } from 'react'
import type { PrestaProductSummary } from '../types'
import { getPrestaProducts } from '../api/prestashop'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'
import { Tag } from './Tag'
import { money, fmt } from '../utils'

type StatusFilter = 'all' | 'active' | 'inactive'
type TypeFilter   = 'all' | 'simple' | 'combo'

const PAGE_SIZE = 50

export function PrestaCatalog() {
  const [products, setProducts] = useState<PrestaProductSummary[] | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter]     = useState<TypeFilter>('all')
  const [page, setPage] = useState(1)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await getPrestaProducts()
      setProducts(data.items)
      setPage(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!products) return []
    const q = search.trim().toLowerCase()
    return products.filter(p => {
      if (q && !String(p.reference).toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false
      if (statusFilter === 'active'   && p.active !== '1') return false
      if (statusFilter === 'inactive' && p.active !== '0') return false
      if (typeFilter === 'simple' && p.combinations > 0) return false
      if (typeFilter === 'combo'  && p.combinations === 0) return false
      return true
    })
  }, [products, search, statusFilter, typeFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageItems  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function onSearch(v: string) { setSearch(v); setPage(1) }
  function onStatus(v: StatusFilter) { setStatusFilter(v); setPage(1) }
  function onType(v: TypeFilter)     { setTypeFilter(v);   setPage(1) }

  if (!products && !loading && !error) {
    return (
      <div className="card">
        <EmptyState
          icon="○"
          title="Catálogo no cargado"
          description="Cargá la lista de productos para explorar, filtrar y buscar en PrestaShop."
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
          placeholder="Buscar por referencia o nombre..."
          value={search}
          onChange={e => onSearch(e.target.value)}
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

        <button className="btn-secondary" type="button" onClick={load} style={{ flexShrink: 0 }}>
          Recargar
        </button>
      </div>

      <div className="catalog-info">
        {filtered.length === 0
          ? 'Sin resultados para los filtros aplicados.'
          : `Mostrando ${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)} de ${fmt(filtered.length)} producto(s)${filtered.length < (products?.length ?? 0) ? ` (filtrado de ${fmt(products?.length)})` : ''}`}
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="○"
            title="Sin resultados"
            description="Probá ajustando la búsqueda o los filtros."
            action={{ label: 'Limpiar filtros', onClick: () => { setSearch(''); setStatusFilter('all'); setTypeFilter('all') } }}
          />
        </div>
      ) : (
        <>
          <div className="catalog-table-wrap">
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
                {pageItems.map(p => {
                  const inactive  = p.active !== '1'
                  const hasCombo  = p.combinations > 0
                  const zeroStock = p.stock === 0
                  return (
                    <tr key={p.productId} className={inactive ? 'row-inactive' : ''}>
                      <td style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{p.productId}</td>
                      <td style={{ fontFamily: 'Consolas, monospace', fontSize: '0.88rem' }}>
                        {p.reference || <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td>{p.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(p.price)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {hasCombo
                          ? <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>ver combos</span>
                          : <span className={zeroStock && !inactive ? 'stock-zero' : ''}>{fmt(p.stock)}</span>
                        }
                      </td>
                      <td>
                        {hasCombo
                          ? <Tag tone="amber">{p.combinations} combos</Tag>
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
              {fmt(filtered.length)} producto(s) total
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
