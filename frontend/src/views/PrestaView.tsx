import { useState } from 'react'
import type { CatalogOverview, PrestaControlResult } from '../types'
import { MessageBox } from '../components/MessageBox'
import { fmt, money, fmtDate } from '../utils'
import { lookupReference, changeProductStatus } from '../api/prestashop'

interface Props {
  overview: CatalogOverview | null
}

export function PrestaView({ overview }: Props) {
  const presta = overview?.prestashop ?? {}
  const contrast = overview?.contrast ?? null

  const [reference, setReference] = useState('')
  const [lookup, setLookup] = useState<PrestaControlResult | null>(null)
  const [lookupMsg, setLookupMsg] = useState<{ text: string; kind: 'info' | 'warn' | 'error' }>({
    text: 'Todavia no consultaste ningun producto.',
    kind: 'info',
  })
  const [lookupLoading, setLookupLoading] = useState(false)

  async function handleLookup() {
    if (!reference.trim()) {
      setLookupMsg({ text: 'Escribe una referencia antes de consultar.', kind: 'warn' })
      return
    }
    setLookupMsg({ text: 'Consultando SAP y PrestaShop...', kind: 'info' })
    setLookupLoading(true)
    try {
      const data = await lookupReference(reference.trim())
      setLookup(data)
      renderLookupMsg(data)
    } catch (err) {
      setLookupMsg({ text: 'Error al consultar: ' + (err instanceof Error ? err.message : String(err)), kind: 'error' })
    } finally {
      setLookupLoading(false)
    }
  }

  function renderLookupMsg(data: PrestaControlResult) {
    const sap = data.sap
    const ps = data.prestashop
    const cmp = data.comparison

    if (ps?.error) {
      setLookupMsg({ text: 'PrestaShop respondio con error: ' + ps.error, kind: 'error' })
      return
    }
    if (!cmp?.existsInSap && !cmp?.existsInPrestashop) {
      setLookupMsg({ text: 'No encontre esa referencia ni en SAP ni en PrestaShop.', kind: 'warn' })
      return
    }
    if (cmp?.existsInSap && !cmp?.existsInPrestashop) {
      setLookupMsg({ text: 'El articulo existe en SAP pero no aparece en PrestaShop.', kind: 'warn' })
      return
    }
    if (!cmp?.existsInSap && cmp?.existsInPrestashop) {
      setLookupMsg({ text: 'El producto existe en PrestaShop pero no lo pude localizar en SAP con esa referencia.', kind: 'warn' })
      return
    }
    if (cmp?.samePrice) {
      setLookupMsg({ text: 'El producto existe en ambos lados y el precio principal coincide.', kind: 'info' })
    } else {
      setLookupMsg({
        text: `El producto existe en ambos lados pero el precio principal no coincide. SAP: ${money(sap?.price)} | PrestaShop: ${money(ps?.productPrice)}`,
        kind: 'warn',
      })
    }
  }

  async function handleChangeStatus(active: boolean) {
    if (!lookup?.prestashop?.productId) {
      setLookupMsg({ text: 'Primero consulta un producto valido de PrestaShop.', kind: 'warn' })
      return
    }
    try {
      const res = await changeProductStatus(lookup.prestashop.productId, active)
      setLookupMsg({ text: res.message, kind: 'info' })
      const data = await lookupReference(reference.trim())
      setLookup(data)
      renderLookupMsg(data)
    } catch (err) {
      setLookupMsg({ text: 'No pude cambiar el estado: ' + (err instanceof Error ? err.message : String(err)), kind: 'error' })
    }
  }

  const psStatus = presta.error ? 'No disponible' : 'Disponible'
  const canChangeStatus = Boolean(lookup?.prestashop?.productId)

  const sapData = lookup?.sap
  const psData = lookup?.prestashop

  return (
    <main className="view active">
      <div className="subnav">
        <button type="button" onClick={() => document.getElementById('presta-summary')?.scrollIntoView({ behavior: 'smooth' })}>Resumen</button>
        <button type="button" onClick={() => document.getElementById('presta-gap')?.scrollIntoView({ behavior: 'smooth' })}>Brechas</button>
        <button type="button" onClick={() => document.getElementById('presta-control')?.scrollIntoView({ behavior: 'smooth' })}>Control puntual</button>
      </div>

      <section id="presta-summary" className="section">
        <div className="section-header">
          <h2 className="section-title">Catálogo PrestaShop</h2>
          <div className="section-note">Lectura actual del webservice.</div>
        </div>
        <div className="grid grid-3">
          <div className="card metric-card">
            <div className="label">Total productos</div>
            <div className="value">{fmt(presta.totalProducts)}</div>
            <div className="hint">Productos encontrados por API</div>
          </div>
          <div className="card metric-card">
            <div className="label">Activos</div>
            <div className="value">{fmt(presta.activeProducts)}</div>
            <div className="hint">Productos activos en tienda</div>
          </div>
          <div className="card metric-card">
            <div className="label">Combinaciones</div>
            <div className="value">{fmt(presta.totalCombinations)}</div>
            <div className="hint">Total de variaciones detectadas</div>
          </div>
        </div>
      </section>

      <section id="presta-gap" className="section">
        <div className="grid grid-4">
          <div className="card stat-box">
            <div className="label">Faltan en PrestaShop</div>
            <div className="value">{fmt(contrast?.missingProductsInPrestashop)}</div>
          </div>
          <div className="card stat-box">
            <div className="label">Activos SAP no publicados</div>
            <div className="value">{fmt(contrast?.activeProductsMissingInPrestashop)}</div>
          </div>
          <div className="card stat-box">
            <div className="label">Extra en PrestaShop</div>
            <div className="value">{fmt(contrast?.extraProductsInPrestashop)}</div>
          </div>
          <div className="card stat-box">
            <div className="label">Estado API</div>
            <div className="value">{psStatus}</div>
          </div>
        </div>
      </section>

      <section id="presta-control" className="section">
        <div className="grid grid-2">
          <div className="card">
            <dl className="data-list">
              <dt>Total productos</dt>
              <dd>{fmt(presta.totalProducts)}</dd>
              <dt>Activos</dt>
              <dd>{fmt(presta.activeProducts)}</dd>
              <dt>Inactivos</dt>
              <dd>{fmt(presta.inactiveProducts)}</dd>
              <dt>Total combinaciones</dt>
              <dd>{fmt(presta.totalCombinations)}</dd>
              <dt>Productos extra</dt>
              <dd>{fmt(contrast?.extraProductsInPrestashop)}</dd>
              <dt>Inactivos extra</dt>
              <dd>{fmt(contrast?.inactiveProductsExtraInPrestashop)}</dd>
            </dl>
          </div>

          <div className="card card-soft">
            <div className="section-header">
              <h2 className="section-title">Control puntual</h2>
              <div className="section-note">Comparar un producto puntual.</div>
            </div>

            <div className="field-grid">
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="control-reference">Referencia o item code</label>
                <input
                  id="control-reference"
                  type="text"
                  placeholder="Ej. 61072505"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                />
              </div>
            </div>

            <div className="button-row" style={{ marginTop: 12 }}>
              <button className="btn-dark" type="button" onClick={handleLookup} disabled={lookupLoading}>
                {lookupLoading ? 'Consultando...' : 'Consultar'}
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              <MessageBox kind={lookupMsg.kind}>{lookupMsg.text}</MessageBox>
            </div>

            <div className="grid grid-2" style={{ marginTop: 16 }}>
              <div>
                <h3 style={{ marginTop: 0 }}>SAP</h3>
                <dl className="data-list">
                  <dt>Item code</dt>
                  <dd>{fmt(sapData?.itemCode)}</dd>
                  <dt>Nombre</dt>
                  <dd>{fmt(sapData?.itemName)}</dd>
                  <dt>Precio</dt>
                  <dd>{money(sapData?.price)}</dd>
                  <dt>Stock</dt>
                  <dd>{fmt(sapData?.stock)}</dd>
                  <dt>Estado</dt>
                  <dd>{sapData?.status === 'Y' ? 'Activo' : sapData?.status ? 'Inactivo' : '-'}</dd>
                </dl>
              </div>

              <div>
                <h3 style={{ marginTop: 0 }}>PrestaShop</h3>
                <dl className="data-list">
                  <dt>Product ID</dt>
                  <dd>{fmt(psData?.productId)}</dd>
                  <dt>Referencia</dt>
                  <dd>{fmt(psData?.reference)}</dd>
                  <dt>Activo</dt>
                  <dd>{psData?.active === '1' ? 'Activo' : psData?.active === '0' ? 'Inactivo' : '-'}</dd>
                  <dt>Precio</dt>
                  <dd>{money(psData?.productPrice)}</dd>
                  <dt>Combinaciones</dt>
                  <dd>{fmt(psData?.combinations?.length ?? null)}</dd>
                  <dt>Stocks</dt>
                  <dd>{fmt(psData?.stockAvailables?.length ?? null)}</dd>
                </dl>
              </div>
            </div>

            <div className="button-row" style={{ marginTop: 12 }}>
              <button className="btn-success" type="button" disabled={!canChangeStatus} onClick={() => handleChangeStatus(true)}>
                Activar
              </button>
              <button className="btn-danger" type="button" disabled={!canChangeStatus} onClick={() => handleChangeStatus(false)}>
                Desactivar
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
