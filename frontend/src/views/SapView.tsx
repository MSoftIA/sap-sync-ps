import type { CatalogOverview } from '../types'
import { Skeleton } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'
import { BarChart } from '../components/BarChart'
import { fmt, number } from '../utils'

interface Props {
  overview: CatalogOverview | null
  onRefresh: () => void
}

export function SapView({ overview, onRefresh }: Props) {
  const sap = overview?.sap ?? {}
  const loading = overview === null

  return (
    <main>
      <div className="subnav">
        <button type="button" onClick={() => document.getElementById('sap-summary')?.scrollIntoView({ behavior: 'smooth' })}>Resumen</button>
        <button type="button" onClick={() => document.getElementById('sap-detail')?.scrollIntoView({ behavior: 'smooth' })}>Detalle</button>
      </div>

      <section id="sap-summary" className="section">
        <div className="section-header">
          <h2 className="section-title">Catálogo SAP</h2>
          <div className="section-note">Fuente de verdad.</div>
        </div>

        {loading ? (
          <div className="grid grid-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="card metric-card">
                <Skeleton width="60%" height={12} />
                <Skeleton width="40%" height={40} />
                <Skeleton width="80%" height={12} />
              </div>
            ))}
          </div>
        ) : sap.error ? (
          <div className="card">
            <EmptyState
              icon="!"
              title="No se pudo conectar a SAP"
              description={sap.error}
              action={{ label: 'Reintentar', onClick: onRefresh }}
            />
          </div>
        ) : (
          <div className="grid grid-3">
            <div className="card metric-card">
              <div className="label">Total productos</div>
              <div className="value">{fmt(sap.totalProducts)}</div>
              <div className="hint">Cantidad total en SAP</div>
            </div>
            <div className="card metric-card">
              <div className="label">Activos</div>
              <div className="value">{fmt(sap.activeProducts)}</div>
              <div className="hint">Productos habilitados en SAP</div>
            </div>
            <div className="card metric-card">
              <div className="label">Stock total</div>
              <div className="value">{number(sap.totalStock, 0)}</div>
              <div className="hint">Suma de unidades del warehouse</div>
            </div>
          </div>
        )}
      </section>

      {!loading && !sap.error && (
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Distribucion del catálogo</h2>
            <div className="section-note">Vista rapida del estado.</div>
          </div>
          <div className="card">
            <BarChart items={[
              { label: 'Activos',    value: sap.activeProducts   ?? 0, color: '#15803d' },
              { label: 'Inactivos',  value: sap.inactiveProducts ?? 0, color: '#667085' },
              { label: 'Con stock',  value: sap.productsWithStock    ?? 0, color: '#3659e3' },
              { label: 'Sin stock',  value: sap.productsWithoutStock ?? 0, color: '#b45309' },
            ]} />
          </div>
        </section>
      )}

      <section id="sap-detail" className="section">
        <div className="card">
          {loading ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {[0,1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} width="100%" height={18} />)}
            </div>
          ) : (
            <dl className="data-list">
              <dt>Schema</dt>
              <dd>{fmt(sap.schema)}</dd>
              <dt>Warehouse</dt>
              <dd>{fmt(sap.warehouse)}</dd>
              <dt>Lista de precios</dt>
              <dd>{fmt(sap.priceList)}</dd>
              <dt>Total productos</dt>
              <dd>{fmt(sap.totalProducts)}</dd>
              <dt>Activos</dt>
              <dd>{fmt(sap.activeProducts)}</dd>
              <dt>Inactivos</dt>
              <dd>{fmt(sap.inactiveProducts)}</dd>
              <dt>Con stock</dt>
              <dd>{fmt(sap.productsWithStock)}</dd>
              <dt>Sin stock</dt>
              <dd>{fmt(sap.productsWithoutStock)}</dd>
              <dt>Unidades totales</dt>
              <dd>{number(sap.totalStock, 3)}</dd>
            </dl>
          )}
        </div>
      </section>
    </main>
  )
}
