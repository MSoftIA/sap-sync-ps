import type { CatalogOverview, DomainAnalysis } from '../types'
import { Skeleton } from '../components/Skeleton'
import { EmptyState } from '../components/EmptyState'
import { BarChart } from '../components/BarChart'
import { Tag } from '../components/Tag'
import { fmt, number, fmtDate } from '../utils'

interface Props {
  overview: CatalogOverview | null
  domainAnalysis: DomainAnalysis | null
  onRefresh: () => void
}

export function SapView({ overview, domainAnalysis, onRefresh }: Props) {
  const sap = overview?.sap ?? {}
  const loading = overview === null

  const categories = domainAnalysis?.domains?.categories
  const orders = domainAnalysis?.domains?.orders
  const catSummary = (categories?.summary ?? {}) as Record<string, unknown>
  const ordersSummary = orders?.summary

  return (
    <main>
      <div className="subnav">
        <button type="button" onClick={() => document.getElementById('sap-productos')?.scrollIntoView({ behavior: 'smooth' })}>Productos</button>
        <button type="button" onClick={() => document.getElementById('sap-categorias')?.scrollIntoView({ behavior: 'smooth' })}>Categorías</button>
        <button type="button" onClick={() => document.getElementById('sap-pedidos')?.scrollIntoView({ behavior: 'smooth' })}>Pedidos</button>
        <button type="button" onClick={() => document.getElementById('sap-detalle')?.scrollIntoView({ behavior: 'smooth' })}>Detalle</button>
      </div>

      {/* Productos */}
      <section id="sap-productos" className="section">
        <div className="section-header">
          <h2 className="section-title">Productos SAP</h2>
          <div className="section-note">Fuente de verdad del catálogo.</div>
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
          <>
            <div className="grid grid-3">
              <div className="card metric-card">
                <div className="label">Total productos</div>
                <div className="value">{fmt(sap.totalProducts)}</div>
                <div className="hint">Artículos en SAP HANA</div>
              </div>
              <div className="card metric-card">
                <div className="label">Activos</div>
                <div className="value">{fmt(sap.activeProducts)}</div>
                <div className="hint">Habilitados para venta</div>
              </div>
              <div className="card metric-card">
                <div className="label">Stock total</div>
                <div className="value">{number(sap.totalStock, 0)}</div>
                <div className="hint">Unidades en {fmt(sap.warehouse) ?? 'warehouse'}</div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 16 }}>
              <div className="section-note" style={{ marginBottom: 12 }}>Distribución del catálogo</div>
              <BarChart items={[
                { label: 'Activos',    value: sap.activeProducts   ?? 0, color: '#15803d' },
                { label: 'Inactivos',  value: sap.inactiveProducts ?? 0, color: '#667085' },
                { label: 'Con stock',  value: sap.productsWithStock    ?? 0, color: '#3659e3' },
                { label: 'Sin stock',  value: sap.productsWithoutStock ?? 0, color: '#b45309' },
              ]} />
            </div>
          </>
        )}
      </section>

      {/* Categorías */}
      <section id="sap-categorias" className="section">
        <div className="section-header">
          <h2 className="section-title">Categorías SAP</h2>
          <div className="section-note">Mapeo de propiedades QryGroup* activas.</div>
        </div>

        {!domainAnalysis ? (
          <div className="grid grid-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="card stat-box">
                <Skeleton width="70%" height={12} />
                <Skeleton width="40%" height={32} />
              </div>
            ))}
          </div>
        ) : !categories?.available ? (
          <div className="card">
            <EmptyState
              icon="○"
              title="Sin análisis de categorías"
              description="Todavía no hay una corrida de análisis de categorías. Ejecuta el dominio 'categories' en Sync."
            />
          </div>
        ) : (
          <>
            <div className="grid grid-4">
              <div className="card stat-box">
                <div className="label">Total evaluado</div>
                <div className="value">{fmt(catSummary.total)}</div>
              </div>
              <div className="card stat-box">
                <div className="label">Categorías únicas</div>
                <div className="value">{fmt(catSummary.uniqueMainCategories)}</div>
              </div>
              <div className="card stat-box">
                <div className="label">Propiedades activas</div>
                <div className="value">{fmt(catSummary.uniqueActiveProperties)}</div>
              </div>
              <div className="card stat-box">
                <div className="label">Sin categoría SAP</div>
                <div className="value">{fmt(catSummary.rowsWithoutMainCategory)}</div>
              </div>
            </div>

            <div className="card card-soft" style={{ marginTop: 12 }}>
              <div className="run-facts">
                <div className="fact-row">
                  <div className="fact-label">Último análisis</div>
                  <div className="fact-value">{fmtDate(categories.generatedAt)}</div>
                </div>
                {categories.alignment && (
                  <div className="fact-row">
                    <div className="fact-label">Alineación con catálogo operativo</div>
                    <div className="fact-value">
                      <Tag tone={categories.alignment.isAligned ? 'green' : 'amber'}>
                        {categories.alignment.isAligned ? 'Alineado' : 'Descalibrado'}
                      </Tag>
                    </div>
                  </div>
                )}
                {categories.alignment && !categories.alignment.isAligned && (
                  <div className="fact-row">
                    <div className="fact-label">Catálogo del reporte vs. SAP actual</div>
                    <div className="fact-value">
                      {fmt(categories.alignment.reportCatalog)} vs. {fmt(categories.alignment.expectedOperationalCatalog)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Pedidos */}
      <section id="sap-pedidos" className="section">
        <div className="section-header">
          <h2 className="section-title">Pedidos SAP</h2>
          <div className="section-note">Lectura operativa de órdenes de venta.</div>
        </div>

        {!domainAnalysis ? (
          <div className="grid grid-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="card stat-box">
                <Skeleton width="70%" height={12} />
                <Skeleton width="40%" height={32} />
              </div>
            ))}
          </div>
        ) : !orders?.available ? (
          <div className="card">
            <EmptyState
              icon="○"
              title="Sin datos de pedidos"
              description={orders?.note ?? 'No se pudo leer el resumen de pedidos desde SAP.'}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-4">
              <div className="card stat-box">
                <div className="label">Últimos 30 días</div>
                <div className="value">{fmt(ordersSummary?.ordersLast30Days)}</div>
              </div>
              <div className="card stat-box">
                <div className="label">Abiertos</div>
                <div className="value">{fmt(ordersSummary?.openOrders)}</div>
              </div>
              <div className="card stat-box">
                <div className="label">Cerrados</div>
                <div className="value">{fmt(ordersSummary?.closedOrders)}</div>
              </div>
              <div className="card stat-box">
                <div className="label">Cancelados</div>
                <div className="value">{fmt(ordersSummary?.canceledOrders)}</div>
              </div>
            </div>

            {ordersSummary && (
              <>
                <div className="card" style={{ marginTop: 12 }}>
                  <BarChart items={[
                    { label: 'Abiertos',    value: ordersSummary.openOrders    ?? 0, color: '#3659e3' },
                    { label: 'Cerrados',    value: ordersSummary.closedOrders  ?? 0, color: '#15803d' },
                    { label: 'Cancelados',  value: ordersSummary.canceledOrders ?? 0, color: '#b91c1c' },
                  ]} />
                </div>

                <div className="card card-soft" style={{ marginTop: 12 }}>
                  <div className="run-facts">
                    {ordersSummary.uniqueCustomers != null && (
                      <div className="fact-row">
                        <div className="fact-label">Clientes con pedidos</div>
                        <div className="fact-value">{fmt(ordersSummary.uniqueCustomers)}</div>
                      </div>
                    )}
                    {ordersSummary.latestDocNum != null && (
                      <div className="fact-row">
                        <div className="fact-label">Último pedido (DocNum)</div>
                        <div className="fact-value">{fmt(ordersSummary.latestDocNum)}</div>
                      </div>
                    )}
                    {ordersSummary.latestDocDate && (
                      <div className="fact-row">
                        <div className="fact-label">Fecha último pedido</div>
                        <div className="fact-value">
                          {new Date(String(ordersSummary.latestDocDate)).toLocaleDateString('es')}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* Detalle técnico */}
      <section id="sap-detalle" className="section">
        <div className="section-header">
          <h2 className="section-title">Detalle de conexión</h2>
          <div className="section-note">Parámetros del snapshot SAP.</div>
        </div>
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
