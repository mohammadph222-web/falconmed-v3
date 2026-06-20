export default function PageHeader({
  zone,
  title,
  description,
  actions,
  filters,
}) {
  return (
    <div className="fm-page-header">
      <div className="fm-page-header-top">
        <div>
          {zone && (
            <div className="fm-page-header-meta">{zone}</div>
          )}
          <h1 className="fm-page-header-title">{title}</h1>
          {description && (
            <p className="fm-page-header-desc">{description}</p>
          )}
        </div>

        {actions && (
          <div className="fm-page-header-actions">{actions}</div>
        )}
      </div>

      {filters && (
        <div className="fm-filter-row">{filters}</div>
      )}
    </div>
  )
}