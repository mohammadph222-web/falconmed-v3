const VARIANT_CLASSES = {
  success: 'fm-badge fm-badge-success',
  warning: 'fm-badge fm-badge-warning',
  danger:  'fm-badge fm-badge-danger',
  info:    'fm-badge fm-badge-info',
  neutral: 'fm-badge fm-badge-neutral',
}

export default function StatusBadge({ variant = 'neutral', children }) {
  return (
    <span className={VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.neutral}>
      {children}
    </span>
  )
}