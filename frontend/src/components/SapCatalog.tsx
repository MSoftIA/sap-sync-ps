import { useState, useEffect, useRef } from 'react'
import type { SapArticle, PaginationMeta } from '../types'
import { getSapProducts } from '../api/sap'
import { Skeleton } from './Skeleton'
import { EmptyState } from './EmptyState'
import { Tag } from './Tag'
import { money, fmt } from '../utils'

type StatusFilter = 'all' | 'active' | 'inactive'
type StockFilter = 'all' | 'with' | 'without'

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
  const [expandedItemCode, setExpandedItemCode] = useState<string | null>(null)

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

  function onStatus(v: StatusFilter) {
    setStatusFilter(v)
    setPage(1)
  }

  function onStock(v: StockFilter) {
    setStockFilter(v)
    setPage(1)
  }

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
          icon="o"
          title="Catalogo no cargado"
          description="Carga la lista de articulos para explorar, filtrar y buscar en el catalogo SAP."
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
          Cargando articulos...
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
  const baseColSpan = onSyncItem ? 8 : 7

  return (
    <>
      <div className="catalog-toolbar">
        <input
          className="catalog-search"
          type="search"
          placeholder="Buscar por codigo o nombre..."
          value={searchInput}
          onChange={e => onSearchInput(e.target.value)}
        />

        <div className="catalog-filter-group">
          <button type="button" className={statusFilter === 'all' ? 'active' : ''} onClick={() => onStatus('all')}>Todos</button>
          <button type="button" className={statusFilter === 'active' ? 'active' : ''} onClick={() => onStatus('active')}>Activos</button>
          <button type="button" className={statusFilter === 'inactive' ? 'active' : ''} onClick={() => onStatus('inactive')}>Inactivos</button>
        </div>

        <div className="catalog-filter-group">
          <button type="button" className={stockFilter === 'all' ? 'active' : ''} onClick={() => onStock('all')}>Todo stock</button>
          <button type="button" className={stockFilter === 'with' ? 'active' : ''} onClick={() => onStock('with')}>Con stock</button>
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
            : `Mostrando ${pageStart}-${pageEnd} de ${fmt(total)} articulo(s)`}
      </div>

      {!loading && total === 0 ? (
        <div className="card">
          <EmptyState
            icon="o"
            title="Sin resultados"
            description="Proba ajustando la busqueda o los filtros."
            action={{ label: 'Limpiar filtros', onClick: clearFilters }}
          />
        </div>
      ) : (
        <>
          <div className="catalog-table-wrap" style={{ opacity: loading ? 0.5 : 1 }}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Codigo</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">Categoria</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Precio</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Stock</th>
                  <th scope="col">Estado</th>
                  {onSyncItem && <th scope="col" style={{ width: 80 }} />}
                  <th scope="col" style={{ width: 96 }} />
                </tr>
              </thead>
              <tbody>
                {items.map(a => {
                  const inactive = a.status !== 'Y'
                  const zeroStock = (a.stock ?? 0) === 0
                  const isSyncing = syncingItemCode === a.itemCode
                  const isExpanded = expandedItemCode === a.itemCode
                  const metadata = a.metadata ?? {}

                  return (
                    <FragmentRow
                      key={a.itemCode}
                      article={a}
                      inactive={inactive}
                      zeroStock={zeroStock}
                      isSyncing={isSyncing}
                      isExpanded={isExpanded}
                      metadata={metadata}
                      onSyncItem={onSyncItem}
                      syncingItemCode={syncingItemCode}
                      baseColSpan={baseColSpan}
                      onToggle={() => setExpandedItemCode(isExpanded ? null : a.itemCode ?? null)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <div className="section-note">
              {fmt(total)} articulo(s) total
            </div>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn-secondary"
                disabled={!pagination?.hasPreviousPage || loading}
                onClick={() => setPage(p => p - 1)}
              >
                Anterior
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
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

interface FragmentRowProps {
  article: SapArticle
  inactive: boolean
  zeroStock: boolean
  isSyncing: boolean
  isExpanded: boolean
  metadata: NonNullable<SapArticle['metadata']>
  onSyncItem?: (itemCode: string) => void
  syncingItemCode?: string | null
  baseColSpan: number
  onToggle: () => void
}

function FragmentRow({
  article,
  inactive,
  zeroStock,
  isSyncing,
  isExpanded,
  metadata,
  onSyncItem,
  syncingItemCode,
  baseColSpan,
  onToggle,
}: FragmentRowProps) {
  return (
    <>
      <tr className={inactive ? 'row-inactive' : ''}>
        <td style={{ fontFamily: 'Consolas, monospace', fontSize: '0.88rem' }}>
          {article.itemCode ?? '-'}
        </td>
        <td>{article.itemName ?? '-'}</td>
        <td style={{ color: article.category ? undefined : 'var(--muted)', fontSize: '0.85rem' }}>
          {article.category ?? '-'}
        </td>
        <td style={{ textAlign: 'right', fontWeight: 700 }}>{money(article.price)}</td>
        <td style={{ textAlign: 'right' }}>
          <span className={zeroStock && !inactive ? 'stock-zero' : ''}>
            {fmt(article.stock) ?? '0'}
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
              onClick={() => article.itemCode && onSyncItem(article.itemCode)}
            >
              {isSyncing && <span className="spinner-dark" style={{ width: 10, height: 10 }} />}
              {isSyncing ? 'Sync...' : 'Sync'}
            </button>
          </td>
        )}
        <td>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '3px 10px', fontSize: '0.8rem' }}
            onClick={onToggle}
          >
            {isExpanded ? 'Ocultar' : 'Detalle'}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="sap-detail-row">
          <td colSpan={baseColSpan}>
            <div className="sap-detail-panel">
              <div className="sap-detail-grid">
                <div><span>Almacen</span><strong>{fmt(article.warehouse)}</strong></div>
                <div><span>Grupo SAP</span><strong>{fmt(article.itemGroupCode)}</strong></div>
                <div><span>Codigo barras</span><strong>{fmt(article.barcode ?? metadata.barcode)}</strong></div>
                <div><span>MPN suplidor</span><strong>{fmt(metadata.manufacturerCatalogNumber)}</strong></div>
                <div><span>Marca SAP</span><strong>{fmt(metadata.manufacturerCode)}</strong></div>
                <div><span>Unidad venta</span><strong>{fmt(metadata.salesUnit)}</strong></div>
                <div><span>Unid. paquete</span><strong>{fmt(metadata.unitsPerPackage)}</strong></div>
                <div><span>Peso</span><strong>{fmt(metadata.weight)}</strong></div>
                <div><span>Imagen SAP</span><strong>{fmt(metadata.pictureName)}</strong></div>
              </div>
              <div className="sap-detail-text">
                <span>Descripcion larga SAP</span>
                <p>{fmt(metadata.longDescription)}</p>
              </div>
              <div className="sap-detail-text">
                <span>Descripcion corta / logistica SAP</span>
                <p>{fmt(metadata.shortDescription)}</p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
