import type { CatalogOverview } from '../types'
import { fmt, number } from '../utils'

interface Props {
  overview: CatalogOverview | null
}

export function SapView({ overview }: Props) {
  const sap = overview?.sap ?? {}

  return (
    <main className="view active">
      <div className="subnav">
        <button type="button" onClick={() => document.getElementById('sap-summary')?.scrollIntoView({ behavior: 'smooth' })}>Resumen</button>
        <button type="button" onClick={() => document.getElementById('sap-detail')?.scrollIntoView({ behavior: 'smooth' })}>Detalle</button>
      </div>

      <section id="sap-summary" className="section">
        <div className="section-header">
          <h2 className="section-title">Catálogo SAP</h2>
          <div className="section-note">Fuente de verdad.</div>
        </div>
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
      </section>

      <section id="sap-detail" className="section">
        <div className="card">
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
        </div>
      </section>
    </main>
  )
}
