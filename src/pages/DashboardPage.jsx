import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import ImportCenterPanel from '../components/ImportCenterPanel'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    pharmacies: 0,
    inventoryRecords: 0,
    totalQuantity: 0,
    totalValue: 0,
    outOfStock: 0,
    lowStock: 0,
    nearExpiry: 0,
    nearExpiryValue: 0,
    critical: 0,
    criticalValue: 0,
    expired: 0,
    expiredValue: 0,
    dispenseEvents: 0,
    transferEvents: 0,
    adjustmentEvents: 0,
  })

  const [pharmacyPerformance, setPharmacyPerformance] = useState([])
  const [inventorySnapshot, setInventorySnapshot]     = useState([])
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
      .select('pharmacy_name, inventory_items, total_quantity, inventory_value_aed')

    if (valueError) {
      console.error('Inventory value view error:', valueError)
    }

    const { data: pharmaciesRows, error: pharmaciesError } = await supabase
      .from('pharmacies')
      .select('id, name, code, pharmacy_type, city, is_active')

    if (pharmaciesError) {
      console.error('Pharmacies error:', pharmaciesError)
    }

    const { data: inventoryRows, error: inventoryError } = await supabase
      .from('inventory')
      .select(
        'id, pharmacy_id, drug_code, quantity_on_hand, minimum_stock, maximum_stock, batch_number, expiry_date, unit_cost, storage_location, inventory_status'
      )

    if (inventoryError) {
      console.error('Inventory performance error:', inventoryError)
    }

    const totalQuantity = (inventoryValueRows || []).reduce(
      (sum, row) => sum + Number(row.total_quantity || 0),
      0
    )

    const totalValue = (inventoryValueRows || []).reduce(
      (sum, row) => sum + Number(row.inventory_value_aed || 0),
      0
    )

    const lowStockTotal = (inventoryRows || []).filter((item) =>
      isLowStock(item)
    ).length

    // ── Financial expiry calculations from inventory rows ──────────────────
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const criticalLimit  = new Date(today); criticalLimit.setDate(today.getDate() + 29)
    const nearExpiryLimit = new Date(today); nearExpiryLimit.setDate(today.getDate() + 90)

    let expiredCount      = 0, expiredValue      = 0
    let criticalCount     = 0, criticalValue     = 0
    let nearExpiryCount   = 0, nearExpiryValue   = 0

    for (const item of (inventoryRows || [])) {
      if (!item.expiry_date) continue
      const exp = new Date(item.expiry_date); exp.setHours(0, 0, 0, 0)
      const lineValue = Number(item.quantity_on_hand || 0) * Number(item.unit_cost || 0)

      if (exp < today) {
        expiredCount++; expiredValue += lineValue
      } else if (exp <= criticalLimit) {
        criticalCount++; criticalValue += lineValue
      } else if (exp <= nearExpiryLimit) {
        nearExpiryCount++; nearExpiryValue += lineValue
      }
    }

    const performanceRows = buildPharmacyPerformance({
      pharmaciesRows:     pharmaciesRows     || [],
      inventoryRows:      inventoryRows      || [],
      inventoryValueRows: inventoryValueRows || [],
    })

    const snapshotRows = buildInventorySnapshot({
      pharmaciesRows: pharmaciesRows || [],
      inventoryRows:  inventoryRows  || [],
    })

    setStats({
      pharmacies,
      inventoryRecords,
      totalQuantity,
      totalValue,
      outOfStock,
      lowStock: lowStockTotal,
      nearExpiry:     nearExpiryCount,
      nearExpiryValue,
      critical:       criticalCount,
      criticalValue,
      expired:        expiredCount,
      expiredValue,
      dispenseEvents,
      transferEvents,
      adjustmentEvents,
    })

    setPharmacyPerformance(performanceRows)
    setInventorySnapshot(snapshotRows)
    setLoading(false)
  }

  const health = useMemo(() => {
    const riskItems =
      stats.outOfStock + stats.expired + stats.nearExpiry + stats.lowStock
    const total = stats.inventoryRecords || 1
    const score = Math.max(0, Math.round(100 - (riskItems / total) * 100))

    if (score >= 80) return { score, label: 'Healthy',  tone: 'green' }
    if (score >= 60) return { score, label: 'Watch',    tone: 'amber' }
    return              { score, label: 'Critical', tone: 'red'   }
  }, [stats])

  const topValuePharmacies = pharmacyPerformance
    .slice()
    .sort((a, b) => b.inventoryValue - a.inventoryValue)
    .slice(0, 10)

  const topLowStockPharmacies = pharmacyPerformance
    .slice()
    .sort((a, b) => b.lowStock - a.lowStock)
    .slice(0, 10)

  const topNearExpiryPharmacies = pharmacyPerformance
    .slice()
    .sort((a, b) => b.nearExpiry - a.nearExpiry)
    .slice(0, 10)

  return (
    <div style={{ color: 'white' }}>

      {/* ── Page header — matches token system ── */}
      <div className="fm-page-header">
        <div className="fm-page-header-top">
          <div>
            <div className="fm-page-header-meta">Command</div>
            <h1 className="fm-page-header-title">Executive dashboard</h1>
            <p className="fm-page-header-desc">
              FalconMed operational overview powered by live inventory,
              dispensing, expiry, transfer, and reconciliation views.
            </p>
          </div>

          <div style={healthBadgeStyle(health.tone)}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Inventory health
            </div>
            <strong style={{ fontSize: 'var(--text-2xl)', color: toneColors[health.tone].text }}>
              {health.score}%
            </strong>
            <span style={{ fontSize: 'var(--text-sm)', color: toneColors[health.tone].text }}>
              {health.label}
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={gridStyle}>
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} style={skeletonCardStyle} />
          ))}
        </div>
      ) : (
        <>
          {/* ── Level 1: Health Score — primary signal ── */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              Overall inventory health
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              padding: '20px 24px',
              background: toneColors[health.tone].shadow,
              border: `1px solid ${toneColors[health.tone].border}`,
              borderRadius: 'var(--radius-lg)',
              marginBottom: '20px',
            }}>
              <div style={{ fontSize: '52px', fontWeight: 900, color: toneColors[health.tone].text, lineHeight: 1 }}>
                {health.score}%
              </div>
              <div>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-medium)', color: toneColors[health.tone].text }}>
                  {health.label}
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  Based on expired, near-expiry, critical, and out-of-stock records across all {stats.pharmacies} pharmacies
                </div>
              </div>
            </div>
          </div>

          {/* ── Level 2: Four financial KPIs ── */}
          <div style={gridStyle}>

            {/* KPI 1 — Total Inventory Value */}
            <StatCard
              title="Total inventory value"
              value={`AED ${formatMoneyCompact(stats.totalValue)}`}
              subValue={`AED ${formatMoney(stats.totalValue)}`}
              badge={null}
              tone="green"
              context={`${formatNumber(stats.inventoryRecords)} inventory lines`}
            />

            {/* KPI 2 — Expired Stock Value */}
            <StatCard
              title="Expired stock value"
              value={`AED ${formatMoneyCompact(stats.expiredValue)}`}
              subValue={`AED ${formatMoney(stats.expiredValue)}`}
              badge="Loss confirmed"
              tone="red"
              context={`${formatNumber(stats.expired)} expired lines — write-off required`}
            />

            {/* KPI 3 — Critical Expiry Value (0–29 days) */}
            <StatCard
              title="Critical expiry value"
              value={`AED ${formatMoneyCompact(stats.criticalValue)}`}
              subValue={`AED ${formatMoney(stats.criticalValue)}`}
              badge="Act this week"
              tone="red"
              context={`${formatNumber(stats.critical)} lines expiring within 29 days`}
            />

            {/* KPI 4 — Near Expiry Value at Risk (30–90 days) */}
            <StatCard
              title="Value at risk — near expiry"
              value={`AED ${formatMoneyCompact(stats.nearExpiryValue)}`}
              subValue={`AED ${formatMoney(stats.nearExpiryValue)}`}
              badge="Preventable loss"
              tone="amber"
              context={`${formatNumber(stats.nearExpiry)} lines expiring within 30–90 days`}
            />

          </div>

          {/* ── Level 3: Pharmacy table sorted by near expiry value ── */}
          <SectionTitle
            title="Pharmacy risk ranking — near expiry"
            subtitle="Pharmacies ranked by value at risk. Highest near-expiry value requires first intervention."
          />

          <div style={threeColumnGridStyle}>
            <MiniRankingCard
              title="Near expiry value at risk"
              rows={[...pharmacyPerformance].sort((a, b) => b.nearExpiryValue - a.nearExpiryValue).slice(0, 10)}
              valueKey="nearExpiryValue"
              valueFormatter={(v) => `AED ${formatMoneyCompact(v)}`}
              tone="amber"
            />
            <MiniRankingCard
              title="Critical expiry value (0–29 days)"
              rows={[...pharmacyPerformance].sort((a, b) => b.criticalValue - a.criticalValue).slice(0, 10)}
              valueKey="criticalValue"
              valueFormatter={(v) => `AED ${formatMoneyCompact(v)}`}
              tone="red"
            />
            <MiniRankingCard
              title="Expired stock value"
              rows={[...pharmacyPerformance].sort((a, b) => b.expiredValue - a.expiredValue).slice(0, 10)}
              valueKey="expiredValue"
              valueFormatter={(v) => `AED ${formatMoneyCompact(v)}`}
              tone="red"
            />
          </div>

          <PharmacyPerformanceTable rows={pharmacyPerformance} />

          <DataReportingPanel
            pharmacyPerformance={pharmacyPerformance}
            inventorySnapshot={inventorySnapshot}
          />

          <ImportCenterPanel />
        </>
      )}
    </div>
  )
}

// ─── buildPharmacyPerformance ─────────────────────────────────────────────────
function buildPharmacyPerformance({
  pharmaciesRows,
  inventoryRows,
  inventoryValueRows,
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const nearExpiryLimit = new Date(today)
  nearExpiryLimit.setDate(nearExpiryLimit.getDate() + 90)

  const valueByName = new Map()

  for (const row of inventoryValueRows) {
    valueByName.set(row.pharmacy_name, {
      inventoryLines: Number(row.inventory_items    || 0),
      totalQuantity:  Number(row.total_quantity      || 0),
      inventoryValue: Number(row.inventory_value_aed || 0),
    })
  }

  const performanceMap = new Map()

  for (const pharmacy of pharmaciesRows) {
    const valueInfo = valueByName.get(pharmacy.name) || {}

    performanceMap.set(pharmacy.id, {
      pharmacyId:      pharmacy.id,
      pharmacyName:    pharmacy.name,
      pharmacyCode:    pharmacy.code,
      pharmacyType:    pharmacy.pharmacy_type,
      inventoryValue:  Number(valueInfo.inventoryValue || 0),
      inventoryLines:  Number(valueInfo.inventoryLines || 0),
      totalQuantity:   Number(valueInfo.totalQuantity  || 0),
      outOfStock:      0,
      lowStock:        0,
      nearExpiry:      0,
      nearExpiryValue: 0,
      critical:        0,
      criticalValue:   0,
      expired:         0,
      expiredValue:    0,
      healthScore:     100,
      healthLabel:     'Healthy',
      healthTone:      'green',
    })
  }

  const today2 = new Date(); today2.setHours(0, 0, 0, 0)
  const critLimit  = new Date(today2); critLimit.setDate(today2.getDate() + 29)
  const neLimit    = new Date(today2); neLimit.setDate(today2.getDate() + 90)

  for (const item of inventoryRows) {
    const row = performanceMap.get(item.pharmacy_id)
    if (!row) continue

    const lineValue = Number(item.quantity_on_hand || 0) * Number(item.unit_cost || 0)

    if (isOutOfStock(item)) row.outOfStock += 1
    if (isLowStock(item))   row.lowStock   += 1

    if (item.expiry_date) {
      const exp = new Date(item.expiry_date); exp.setHours(0, 0, 0, 0)
      if (exp < today2) {
        row.expired++;      row.expiredValue      += lineValue
      } else if (exp <= critLimit) {
        row.critical++;     row.criticalValue     += lineValue
      } else if (exp <= neLimit) {
        row.nearExpiry++;   row.nearExpiryValue   += lineValue
      }
    }
  }

  const rows = Array.from(performanceMap.values()).map((row) => {
    const riskItems =
      row.outOfStock + row.lowStock + row.nearExpiry + row.expired

    const denominator = row.inventoryLines || 1
    const healthScore = Math.max(
      0,
      Math.round(100 - (riskItems / denominator) * 100)
    )

    let healthLabel = 'Healthy'
    let healthTone  = 'green'

    if (healthScore < 60) { healthLabel = 'Critical'; healthTone = 'red'   }
    else if (healthScore < 80) { healthLabel = 'Watch'; healthTone = 'amber' }

    return { ...row, healthScore, healthLabel, healthTone }
  })

  return rows.sort((a, b) => b.nearExpiryValue - a.nearExpiryValue)
}

// ─── Stock status helpers ─────────────────────────────────────────────────────
function isOutOfStock(item) {
  return Number(item.quantity_on_hand || 0) <= 0
}

function isLowStock(item) {
  const quantity = Number(item.quantity_on_hand || 0)
  const minimum  = Number(item.minimum_stock    || 0)
  return quantity > 0 && minimum > 0 && quantity <= minimum
}

function isExpired(item, today) {
  if (!item.expiry_date) return false
  const expiryDate = new Date(item.expiry_date)
  expiryDate.setHours(0, 0, 0, 0)
  return expiryDate < today
}

function isNearExpiry(item, today, nearExpiryLimit) {
  if (!item.expiry_date) return false
  const expiryDate = new Date(item.expiry_date)
  expiryDate.setHours(0, 0, 0, 0)
  return expiryDate >= today && expiryDate <= nearExpiryLimit
}

// ─── buildInventorySnapshot ───────────────────────────────────────────────────
function buildInventorySnapshot({ pharmaciesRows, inventoryRows }) {
  const pharmacyMap = new Map(
    pharmaciesRows.map((pharmacy) => [pharmacy.id, pharmacy])
  )

  return inventoryRows.map((item) => {
    const pharmacy = pharmacyMap.get(item.pharmacy_id)

    return {
      pharmacy_name:       pharmacy?.name || '',
      pharmacy_code:       pharmacy?.code || '',
      drug_code:           item.drug_code           || '',
      batch_number:        item.batch_number         || '',
      expiry_date:         item.expiry_date          || '',
      quantity_on_hand:    Number(item.quantity_on_hand || 0),
      minimum_stock:       Number(item.minimum_stock    || 0),
      maximum_stock:       Number(item.maximum_stock    || 0),
      unit_cost:           Number(item.unit_cost        || 0),
      inventory_value_aed:
        Number(item.quantity_on_hand || 0) * Number(item.unit_cost || 0),
      storage_location: item.storage_location || '',
      inventory_status: item.inventory_status || '',
    }
  })
}

// ─── createImportJob ──────────────────────────────────────────────────────────
async function createImportJob({
  importType,
  fileName,
  totalRows,
  validRows,
  invalidRows,
}) {
  const { error } = await supabase
    .from('import_jobs')
    .insert([
      {
        import_type:  importType,
        file_name:    fileName,
        total_rows:   totalRows,
        valid_rows:   validRows,
        invalid_rows: invalidRows,
        status:       'COMPLETED',
        started_at:   new Date().toISOString(),
        completed_at: new Date().toISOString(),
        notes:        'Created from FalconMed Import Center',
      },
    ])

  if (error) {
    console.error('Import job error:', error)
    return false
  }

  return true
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ title, value, subValue, tone, badge, context }) {
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
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
          {title}
        </div>
        {badge && <span style={badgeStyle(color)}>{badge}</span>}
      </div>

      <div style={{ color: color.text, fontSize: '34px', fontWeight: 900 }}>
        {value}
      </div>

      {subValue && (
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', marginTop: '6px' }}>
          {subValue}
        </div>
      )}

      {context && (
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', marginTop: '4px', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '8px' }}>
          {context}
        </div>
      )}

      <div style={{ height: '3px', background: 'var(--color-bg-content)', borderRadius: '999px', marginTop: '12px', overflow: 'hidden' }}>
        <div style={{ width: '60%', height: '100%', background: color.text, borderRadius: '999px' }} />
      </div>
    </div>
  )
}

// ─── SectionTitle ─────────────────────────────────────────────────────────────
function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ marginTop: '36px', marginBottom: '18px' }}>
      <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
        {title}
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', marginTop: '6px', fontSize: 'var(--text-sm)' }}>
        {subtitle}
      </p>
    </div>
  )
}

// ─── MiniRankingCard ──────────────────────────────────────────────────────────
function MiniRankingCard({ title, rows, valueKey, valueFormatter, tone }) {
  const color    = toneColors[tone] || toneColors.blue
  const maxValue = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1)

  return (
    <div style={panelStyle}>
      <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>
        {title}
      </h3>

      <div style={{ display: 'grid', gap: '14px' }}>
        {rows.map((row) => {
          const value = Number(row[valueKey] || 0)
          const width = Math.max(4, Math.round((value / maxValue) * 100))

          return (
            <div key={`${title}-${row.pharmacyId}`}>
              <div style={rankingRowTopStyle}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                  {row.pharmacyName}
                </span>
                <strong style={{ color: color.text, fontSize: 'var(--text-sm)' }}>
                  {valueFormatter(value)}
                </strong>
              </div>

              <div style={barTrackStyle}>
                <div
                  style={{
                    ...barFillStyle,
                    width:      `${width}%`,
                    background: color.text,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── PharmacyPerformanceTable ─────────────────────────────────────────────────
function PharmacyPerformanceTable({ rows }) {
  return (
    <div style={tablePanelStyle}>
      <div style={tableHeaderStyle}>
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}>
            Pharmacy Performance Table
          </h3>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '6px', fontSize: 'var(--text-sm)' }}>
            Value, shortage, expiry risk, and health score by pharmacy.
          </p>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Pharmacy</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Inventory Value</th>
              <th style={thStyle}>Near Expiry Value</th>
              <th style={thStyle}>Critical Value</th>
              <th style={thStyle}>Expired Value</th>
              <th style={thStyle}>Out of Stock</th>
              <th style={thStyle}>Health</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const color = toneColors[row.healthTone] || toneColors.blue

              return (
                <tr key={row.pharmacyId}>
                  <td style={tdStyle}>
                    <strong style={{ color: 'var(--color-text-primary)' }}>{row.pharmacyName}</strong>
                    <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                      {row.pharmacyCode || '-'}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                    {row.pharmacyType || '—'}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--color-success)' }}>
                    AED {formatMoney(row.inventoryValue)}
                  </td>
                  <td style={{ ...tdStyle, color: row.nearExpiryValue > 0 ? 'var(--color-warning-mid)' : 'var(--color-text-secondary)' }}>
                    {row.nearExpiryValue > 0 ? `AED ${formatMoney(row.nearExpiryValue)}` : '—'}
                    {row.nearExpiry > 0 && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        {row.nearExpiry} lines
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: row.criticalValue > 0 ? 'var(--color-danger-mid)' : 'var(--color-text-secondary)' }}>
                    {row.criticalValue > 0 ? `AED ${formatMoney(row.criticalValue)}` : '—'}
                    {row.critical > 0 && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        {row.critical} lines
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: row.expiredValue > 0 ? 'var(--color-danger-mid)' : 'var(--color-text-secondary)' }}>
                    {row.expiredValue > 0 ? `AED ${formatMoney(row.expiredValue)}` : '—'}
                    {row.expired > 0 && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        {row.expired} lines
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: row.outOfStock > 0 ? 'var(--color-danger-mid)' : 'var(--color-text-secondary)' }}>
                    {formatNumber(row.outOfStock)}
                  </td>
                  <td style={tdStyle}>
                    <span style={scoreBadgeStyle(color)}>
                      {row.healthScore}% · {row.healthLabel}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── DataReportingPanel ───────────────────────────────────────────────────────
function DataReportingPanel({ pharmacyPerformance, inventorySnapshot }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const nearExpiryLimit = new Date(today)
  nearExpiryLimit.setDate(today.getDate() + 90)

  const lowStockRows = inventorySnapshot.filter(
    (item) =>
      Number(item.quantity_on_hand || 0) > 0 &&
      Number(item.minimum_stock    || 0) > 0 &&
      Number(item.quantity_on_hand || 0) <= Number(item.minimum_stock || 0)
  )

  const expiredRows = inventorySnapshot.filter((item) => {
    if (!item.expiry_date) return false
    const expiry = new Date(item.expiry_date)
    expiry.setHours(0, 0, 0, 0)
    return expiry < today
  })

  const nearExpiryRows = inventorySnapshot.filter((item) => {
    if (!item.expiry_date) return false
    const expiry = new Date(item.expiry_date)
    expiry.setHours(0, 0, 0, 0)
    return expiry >= today && expiry <= nearExpiryLimit
  })

  function exportExcel(filename, sheetName, rows) {
    if (!rows?.length) { alert('No data available for export.'); return }
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook  = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    XLSX.writeFile(workbook, filename)
  }

  function exportCSV(filename, rows) {
    if (!rows?.length) { alert('No data available for export.'); return }

    const headers = Object.keys(rows[0])
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={reportingPanelStyle}>
      <h2 style={{ marginTop: 0, fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}>
        Data &amp; Reporting
      </h2>

      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
        Export FalconMed operational intelligence for Power BI, Excel,
        reporting, and external analytics.
      </p>

      <div style={reportingButtonGridStyle}>
        <button style={exportButtonStyle}
          onClick={() => exportCSV('falconmed_pharmacy_performance.csv', pharmacyPerformance)}>
          Export Pharmacy Performance CSV
        </button>

        <button style={excelButtonStyle}
          onClick={() => exportExcel('falconmed_pharmacy_performance.xlsx', 'Pharmacy Performance', pharmacyPerformance)}>
          Export Pharmacy Performance Excel
        </button>

        <button style={exportButtonStyle}
          onClick={() => exportCSV('falconmed_inventory_snapshot.csv', inventorySnapshot)}>
          Export Inventory Snapshot CSV
        </button>

        <button style={excelButtonStyle}
          onClick={() => exportExcel('falconmed_inventory_snapshot.xlsx', 'Inventory Snapshot', inventorySnapshot)}>
          Export Inventory Snapshot Excel
        </button>

        <button style={excelButtonStyle}
          onClick={() => exportExcel('falconmed_low_stock.xlsx', 'Low Stock', lowStockRows)}>
          Export Low Stock Excel
        </button>

        <button style={excelButtonStyle}
          onClick={() => exportExcel('falconmed_near_expiry.xlsx', 'Near Expiry', nearExpiryRows)}>
          Export Near Expiry Excel
        </button>

        <button style={excelButtonStyle}
          onClick={() => exportExcel('falconmed_expired_inventory.xlsx', 'Expired Inventory', expiredRows)}>
          Export Expired Excel
        </button>

        <button style={exportButtonStyle}
          onClick={() => exportCSV('falconmed_low_stock.csv', lowStockRows)}>
          Export Low Stock CSV
        </button>

        <button style={exportButtonStyle}
          onClick={() => exportCSV('falconmed_near_expiry.csv', nearExpiryRows)}>
          Export Near Expiry CSV
        </button>

        <button style={exportButtonStyle}
          onClick={() => exportCSV('falconmed_expired_inventory.csv', expiredRows)}>
          Export Expired CSV
        </button>
      </div>
    </div>
  )
}

// ─── Formatters ───────────────────────────────────────────────────────────────
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
    notation:             'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

function formatMoneyCompact(value) {
  return Intl.NumberFormat(undefined, {
    notation:             'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0))
}

// ─── Style constants ──────────────────────────────────────────────────────────
const headerStyle = {
  display:        'flex',
  justifyContent: 'space-between',
  alignItems:     'flex-start',
  gap:            '20px',
  marginBottom:   '28px',
  flexWrap:       'wrap',
}

const gridStyle = {
  display:             'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap:                 '18px',
  marginTop:           '24px',
}

const threeColumnGridStyle = {
  display:             'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap:                 '18px',
  marginTop:           '18px',
}

const reportingPanelStyle = {
  background:   'var(--color-bg-card)',
  border:       '1px solid var(--color-border-default)',
  borderRadius: 'var(--radius-lg)',
  padding:      '24px',
  marginTop:    '24px',
}

const reportingButtonGridStyle = {
  display:             'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap:                 '12px',
  marginTop:           '18px',
}

const exportButtonStyle = {
  background:   'rgba(24,95,165,0.12)',
  color:        'var(--color-text-accent)',
  border:       '1px solid rgba(24,95,165,0.30)',
  borderRadius: 'var(--radius-md)',
  padding:      '12px 16px',
  cursor:       'pointer',
  fontWeight:   'var(--font-medium)',
  fontSize:     'var(--text-sm)',
  fontFamily:   'var(--font-sans)',
  textAlign:    'left',
}

const excelButtonStyle = {
  ...exportButtonStyle,
  background: 'rgba(29,158,117,0.12)',
  color:      'var(--color-success)',
  border:     '1px solid rgba(29,158,117,0.30)',
}

const cardStyle = {
  background:   'var(--color-bg-card)',
  padding:      '24px',
  borderRadius: 'var(--radius-lg)',
  border:       '1px solid var(--color-border-default)',
  color:        'white',
  minHeight:    '130px',
}

const panelStyle = {
  background:   'var(--color-bg-card)',
  padding:      '22px',
  borderRadius: 'var(--radius-lg)',
  border:       '1px solid var(--color-border-default)',
  color:        'white',
}

const tablePanelStyle = {
  ...panelStyle,
  padding:    0,
  overflow:   'hidden',
  marginTop:  '18px',
}

const tableHeaderStyle = {
  display:        'flex',
  justifyContent: 'space-between',
  gap:            '16px',
  marginBottom:   '0',
  flexWrap:       'wrap',
  padding:        '16px',
  borderBottom:   '1px solid var(--color-border-subtle)',
}

const cardTopStyle = {
  display:        'flex',
  justifyContent: 'space-between',
  gap:            '12px',
  marginBottom:   '16px',
}

const skeletonCardStyle = {
  ...cardStyle,
  minHeight: '130px',
  opacity:   0.35,
}

const rankingRowTopStyle = {
  display:        'flex',
  justifyContent: 'space-between',
  gap:            '12px',
  marginBottom:   '6px',
}

const barTrackStyle = {
  height:       '6px',
  background:   'var(--color-bg-content)',
  borderRadius: 'var(--radius-pill)',
  overflow:     'hidden',
}

const barFillStyle = {
  height:       '100%',
  borderRadius: 'var(--radius-pill)',
}

const tableStyle = {
  width:           '100%',
  borderCollapse:  'collapse',
  minWidth:        '1100px',
}

const thStyle = {
  textAlign:    'left',
  padding:      '12px 16px',
  color:        'var(--color-text-tertiary)',
  fontSize:     'var(--text-xs)',
  borderBottom: '1px solid var(--color-border-subtle)',
  whiteSpace:   'nowrap',
  textTransform:'uppercase',
  letterSpacing:'0.06em',
}

const tdStyle = {
  padding:      '12px 16px',
  borderBottom: '1px solid var(--color-border-subtle)',
  color:        'var(--color-text-secondary)',
  fontSize:     'var(--text-sm)',
  whiteSpace:   'nowrap',
}

function badgeStyle(color) {
  return {
    color:        color.text,
    border:       `1px solid ${color.border}`,
    background:   color.shadow,
    borderRadius: 'var(--radius-pill)',
    padding:      '3px 9px',
    fontSize:     '11px',
    fontWeight:   'var(--font-medium)',
    whiteSpace:   'nowrap',
  }
}

function scoreBadgeStyle(color) {
  return {
    color:        color.text,
    border:       `1px solid ${color.border}`,
    background:   color.shadow,
    borderRadius: 'var(--radius-pill)',
    padding:      '4px 10px',
    fontSize:     'var(--text-xs)',
    fontWeight:   'var(--font-medium)',
    whiteSpace:   'nowrap',
  }
}

function healthBadgeStyle(tone) {
  const color = toneColors[tone] || toneColors.blue
  return {
    minWidth:     '170px',
    background:   'var(--color-bg-card)',
    border:       `1px solid ${color.border}`,
    borderRadius: 'var(--radius-lg)',
    padding:      '16px',
    color:        color.text,
    display:      'grid',
    gap:          '4px',
  }
}

// ─── Tone colour map — uses token values ──────────────────────────────────────
const toneColors = {
  blue: {
    text:   'var(--color-primary)',
    border: 'rgba(24,95,165,0.30)',
    shadow: 'rgba(24,95,165,0.12)',
  },
  green: {
    text:   'var(--color-success)',
    border: 'rgba(29,158,117,0.30)',
    shadow: 'rgba(29,158,117,0.12)',
  },
  red: {
    text:   'var(--color-danger-mid)',
    border: 'rgba(163,45,45,0.30)',
    shadow: 'rgba(163,45,45,0.12)',
  },
  amber: {
    text:   'var(--color-warning-mid)',
    border: 'rgba(186,117,23,0.30)',
    shadow: 'rgba(186,117,23,0.12)',
  },
  purple: {
    text:   '#c084fc',
    border: 'rgba(168,85,247,0.30)',
    shadow: 'rgba(168,85,247,0.12)',
  },
  cyan: {
    text:   '#22d3ee',
    border: 'rgba(34,211,238,0.30)',
    shadow: 'rgba(34,211,238,0.12)',
  },
  orange: {
    text:   '#fb923c',
    border: 'rgba(251,146,60,0.30)',
    shadow: 'rgba(251,146,60,0.12)',
  },
}
