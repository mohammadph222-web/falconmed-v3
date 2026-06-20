export function formatNumber(value) {
  return Number(value || 0).toLocaleString()
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatMoneyCompact(value) {
  return Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

export function formatCompact(value) {
  return Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

export function formatPercent(value, decimals = 1) {
  return `${Number(value || 0).toFixed(decimals)}%`
}

export function formatAED(value) {
  return `AED ${formatMoney(value)}`
}

export function formatAEDCompact(value) {
  return `AED ${formatMoneyCompact(value)}`
}