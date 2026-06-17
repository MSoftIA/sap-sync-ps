interface Props {
  icon?: string
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon = 'o', title, description, action }: Props) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <p className="empty-state-title">{title}</p>
      <p className="empty-state-desc">{description}</p>
      {action && (
        <button className="btn-secondary" type="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
