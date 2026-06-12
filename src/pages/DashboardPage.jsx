import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    pharmacies: 0,
    inventoryRecords: 0,
    totalQuantity: 0,
    totalValue: 0,
    outOfStock: 0,
    nearExpiry: 0,
    expired: 0,
    dispenseEvents: 0,
    transferEvents: 0,
    adjustmentEvents: 0,
  })

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function getCount(tableName) {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error(`${tableName} count error:`, error)
      return 0
    }

    return count || 0
  }

  async function loadDashboard() {
    setLoading(true)

    const [
      pharmacies,
      inventoryRecords,
      outOfStock,
      nearExpiry,
      expired,
      dispenseEvents,
      transferEvents,
      adjustmentEvents,
    ] = await Promise.all([
      getCount('pharmacies'),
      getCount('inventory'),
      getCount('vw_out_of_stock_inventory'),
      getCount('vw_near_expiry_inventory'),
      getCount('vw_expired_inventory'),
      getCount('vw_dispensing_activity'),
      getCount('vw_transfer_activity'),
      getCount('vw_adjustment_activity'),
    ])

    const { data: inventoryValueRows, error: valueError } = await supabase
      .from('vw_inventory_value_by_pharmacy')
      .select('total_quantity, inventory_value_aed')

    if (valueError) {
      console.error('Inventory value view error:', valueError)
    }

    const totalQuantity = (inventoryValueRows || []).reduce(
      (sum, row) => sum + Number(row.total_quantity || 0),
      0
    )

    const totalValue = (inventoryValueRows || []).reduce(
      (sum, row) => sum + Number(row.inventory_value_aed || 0),
      0
    )

    setStats({
      pharmacies,
      inventoryRecords,
      totalQuantity,
      totalValue,
      outOfStock,
      nearExpiry,
      expired,
      dispenseEvents,
      transferEvents,
      adjustmentEvents,
    })

    setLoading(false)
  }

  const health = useMemo(() => {
    const riskItems = stats.outOfStock + stats.expired + stats.nearExpiry
    const total = stats.inventoryRecords || 1
    const score = Math.max(0, Math.round(100 - (riskItems / total) * 100))

    if (score >= 80) return { score, label: 'Healthy', tone: 'green' }
    if (score >= 60) return { score, label: 'Watch', tone: 'amber' }
    return { score, label: 'Critical', tone: 'red' }
  }, [stats])

  return (
    <div style={{ padding: '24px', color: 'white' }}>
      <div style={headerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: '36px' }}>Executive Dashboard</h1>
          <p style={{ color: '#94a3b8', marginTop: '8px', fontSize: '16px' }}>
            FalconMed operational overview powered by live inventory, dispensing,
            expiry, transfer, and reconciliation views.
          </p>
        </div>

        <div style={healthBadgeStyle(health.tone)}>
          <div style={{ fontSize: '13px', color: '#cbd5e1' }}>Inventory Health</div>
          <strong>{health.score}%</strong>
          <span>{health.label}</span>
        </div>
      </div>

      {loading ? (
        <div style={gridStyle}>
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} style={skeletonCardStyle} />
          ))}
        </div>
      ) : (
        <div style={gridStyle}>
          <StatCard title="Total Pharmacies" value={stats.pharmacies} tone="blue" />
          <StatCard title="Inventory Records" value={formatNumber(stats.inventoryRecords)} tone="blue" />
          <StatCard title="Total Quantity" value={formatCompact(stats.totalQuantity)} subValue={formatNumber(stats.totalQuantity)} tone="blue" />
          <StatCard title="Inventory Value" value={`AED ${formatMoneyCompact(stats.totalValue)}`} subValue={`AED ${formatMoney(stats.totalValue)}`} tone="green" />

          <StatCard title="Out of Stock" value={stats.outOfStock} tone="red" badge="Action Required" />
          <StatCard title="Near Expiry" value={stats.nearExpiry} tone="amber" badge="Warning" />
          <StatCard title="Expired Items" value={stats.expired} tone="red" badge="Critical" />
          <StatCard title="Dispense Events" value={stats.dispenseEvents} tone="purple" />

          <StatCard title="Transfer Activity" value={stats.transferEvents} tone="cyan" />
          <StatCard title="Adjustment Activity" value={stats.adjustmentEvents} tone="orange" />
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value, subValue, tone, badge }) {
  const color = toneColors[tone] || toneColors.blue

  return (
    <div
      style={{
        ...cardStyle,
        borderColor: color.border,
        boxShadow: `0 0 0 1px ${color.shadow}`,
      }}
    >
      <div style={cardTopStyle}>
        <div style={{ color: '#cbd5e1', fontSize: '15px' }}>{title}</div>
        {badge && <span style={badgeStyle(color)}>{badge}</span>}
      </div>

      <div style={{ color: color.text, fontSize: '34px', fontWeight: 900 }}>
        {value}
      </div>

      {subValue && (
        <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '10px' }}>
          Full value: {subValue}
        </div>
      )}
    </div>
  )
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString()
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatCompact(value) {
  return Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

function formatMoneyCompact(value) {
  return Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '20px',
  marginBottom: '28px',
  flexWrap: 'wrap',
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: '18px',
  marginTop: '24px',
}

const cardStyle = {
  background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
  padding: '24px',
  borderRadius: '18px',
  border: '1px solid #334155',
  color: 'white',
  minHeight: '130px',
}

const cardTopStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  marginBottom: '16px',
}

const skeletonCardStyle = {
  ...cardStyle,
  minHeight: '130px',
  opacity: 0.45,
}

function badgeStyle(color) {
  return {
    color: color.text,
    border: `1px solid ${color.border}`,
    background: color.shadow,
    borderRadius: '999px',
    padding: '4px 9px',
    fontSize: '11px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  }
}

function healthBadgeStyle(tone) {
  const color = toneColors[tone] || toneColors.blue

  return {
    minWidth: '170px',
    background: '#0f172a',
    border: `1px solid ${color.border}`,
    boxShadow: `0 0 0 1px ${color.shadow}`,
    borderRadius: '18px',
    padding: '16px',
    color: color.text,
    display: 'grid',
    gap: '4px',
  }
}

const toneColors = {
  blue: {
    text: '#60a5fa',
    border: '#334155',
    shadow: 'rgba(96, 165, 250, 0.18)',
  },
  green: {
    text: '#34d399',
    border: '#14532d',
    shadow: 'rgba(52, 211, 153, 0.18)',
  },
  red: {
    text: '#f87171',
    border: '#7f1d1d',
    shadow: 'rgba(248, 113, 113, 0.18)',
  },
  amber: {
    text: '#fbbf24',
    border: '#78350f',
    shadow: 'rgba(251, 191, 36, 0.18)',
  },
  purple: {
    text: '#c084fc',
    border: '#581c87',
    shadow: 'rgba(192, 132, 252, 0.18)',
  },
  cyan: {
    text: '#22d3ee',
    border: '#164e63',
    shadow: 'rgba(34, 211, 238, 0.18)',
  },
  orange: {
    text: '#fb923c',
    border: '#7c2d12',
    shadow: 'rgba(251, 146, 60, 0.18)',
  },
}