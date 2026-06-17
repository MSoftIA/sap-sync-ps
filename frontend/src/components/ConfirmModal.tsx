interface Props {
  domains: string[]
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ domains, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Confirmar sincronizacion</h2>
        <p className="modal-subtitle">Estas a punto de aplicar cambios reales en PrestaShop.</p>

        <div className="modal-warning">
          Esto modificara productos en la tienda. Solo los dominios listos para escritura seran afectados.
        </div>

        <div className="modal-detail">
          <div className="modal-detail-row">
            <span className="modal-detail-label">Dominios</span>
            <span className="modal-detail-value">{domains.join(', ')}</span>
          </div>
          <div className="modal-detail-row">
            <span className="modal-detail-label">Modo</span>
            <span className="modal-detail-value">Aplicar cambios reales en PrestaShop</span>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn-danger" type="button" onClick={onConfirm}>
            Confirmar y ejecutar
          </button>
        </div>
      </div>
    </div>
  )
}
