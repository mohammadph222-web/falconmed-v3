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
    expired: 0,
    dispenseEvents: 0,
    transferEvents: 0,
    adjustmentEvents: 0,
  })

  const [pharmacyPerformance, setPharmacyPerformance] = useState([])
    const [inventorySnapshot, setInventorySnapshot] = useState([])
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

    const performanceRows = buildPharmacyPerformance({
      pharmaciesRows: pharmaciesRows || [],
      inventoryRows: inventoryRows || [],
      inventoryValueRows: inventoryValueRows || [],
    })
         const snapshotRows = buildInventorySnapshot({
  pharmaciesRows: pharmaciesRows || [],
  inventoryRows: inventoryRows || [],
})
    setStats({
      pharmacies,
      inventoryRecords,
      totalQuantity,
      totalValue,
      outOfStock,
      lowStock: lowStockTotal,
      nearExpiry,
      expired,
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

    if (score >= 80) return { score, label: 'Healthy', tone: 'green' }
    if (score >= 60) return { score, label: 'Watch', tone: 'amber' }
    return { score, label: 'Critical', tone: 'red' }
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
    <div style={{ padding: '24px', color: 'white' }}>
      <div style={headerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: '36px' }}>Executive Dashboard</h1>
          <p style={{ color: '#94a3b8', marginTop: '8px', fontSize: '16px' }}>
            FalconMed operational overview powered by live inventory,
            dispensing, expiry, transfer, and reconciliation views.
          </p>
        </div>

        <div style={healthBadgeStyle(health.tone)}>
          <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
            Inventory Health
          </div>
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
        <>
          <div style={gridStyle}>
            <StatCard title="Total Pharmacies" value={stats.pharmacies} tone="blue" />
            <StatCard title="Inventory Records" value={formatNumber(stats.inventoryRecords)} tone="blue" />
            <StatCard title="Total Quantity" value={formatCompact(stats.totalQuantity)} subValue={formatNumber(stats.totalQuantity)} tone="blue" />
            <StatCard title="Inventory Value" value={`AED ${formatMoneyCompact(stats.totalValue)}`} subValue={`AED ${formatMoney(stats.totalValue)}`} tone="green" />

            <StatCard title="Out of Stock" value={stats.outOfStock} tone="red" badge="Action Required" />
            <StatCard title="Low Stock" value={stats.lowStock} tone="amber" badge="Shortage Risk" />
            <StatCard title="Near Expiry" value={stats.nearExpiry} tone="amber" badge="Warning" />
            <StatCard title="Expired Items" value={stats.expired} tone="red" badge="Critical" />

            <StatCard title="Dispense Events" value={stats.dispenseEvents} tone="purple" />
            <StatCard title="Transfer Activity" value={stats.transferEvents} tone="cyan" />
            <StatCard title="Adjustment Activity" value={stats.adjustmentEvents} tone="orange" />
          </div>

          <SectionTitle
            title="Phase 8.1 — Pharmacy Performance Dashboard"
            subtitle="Live pharmacy-level operational intelligence from Supabase inventory and value views."
          />

          <div style={threeColumnGridStyle}>
            <MiniRankingCard
              title="Inventory Value by Pharmacy"
              rows={topValuePharmacies}
              valueKey="inventoryValue"
              valueFormatter={(value) => `AED ${formatMoneyCompact(value)}`}
              tone="green"
            />

            <MiniRankingCard
              title="Low Stock by Pharmacy"
              rows={topLowStockPharmacies}
              valueKey="lowStock"
              valueFormatter={formatNumber}
              tone="amber"
            />

            <MiniRankingCard
              title="Near Expiry by Pharmacy"
              rows={topNearExpiryPharmacies}
              valueKey="nearExpiry"
              valueFormatter={formatNumber}
              tone="orange"
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
      inventoryLines: Number(row.inventory_items || 0),
      totalQuantity: Number(row.total_quantity || 0),
      inventoryValue: Number(row.inventory_value_aed || 0),
    })
  }

  const performanceMap = new Map()

  for (const pharmacy of pharmaciesRows) {
    const valueInfo = valueByName.get(pharmacy.name) || {}

    performanceMap.set(pharmacy.id, {
      pharmacyId: pharmacy.id,
      pharmacyName: pharmacy.name,
      pharmacyCode: pharmacy.code,
      pharmacyType: pharmacy.pharmacy_type,
      inventoryValue: Number(valueInfo.inventoryValue || 0),
      inventoryLines: Number(valueInfo.inventoryLines || 0),
      totalQuantity: Number(valueInfo.totalQuantity || 0),
      outOfStock: 0,
      lowStock: 0,
      nearExpiry: 0,
      expired: 0,
      healthScore: 100,
      healthLabel: 'Healthy',
      healthTone: 'green',
    })
  }

  for (const item of inventoryRows) {
    const row = performanceMap.get(item.pharmacy_id)
    if (!row) continue

    if (isOutOfStock(item)) row.outOfStock += 1
    if (isLowStock(item)) row.lowStock += 1
    if (isExpired(item, today)) row.expired += 1
    if (isNearExpiry(item, today, nearExpiryLimit)) row.nearExpiry += 1
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
    let healthTone = 'green'

    if (healthScore < 60) {
      healthLabel = 'Critical'
      healthTone = 'red'
    } else if (healthScore < 80) {
      healthLabel = 'Watch'
      healthTone = 'amber'
    }

    return {
      ...row,
      healthScore,
      healthLabel,
      healthTone,
    }
  })

  return rows.sort((a, b) => b.inventoryValue - a.inventoryValue)
}

function isOutOfStock(item) {
  return Number(item.quantity_on_hand || 0) <= 0
}

function isLowStock(item) {
  const quantity = Number(item.quantity_on_hand || 0)
  const minimum = Number(item.minimum_stock || 0)

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

function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ marginTop: '36px', marginBottom: '18px' }}>
      <h2 style={{ margin: 0, fontSize: '26px' }}>{title}</h2>
      <p style={{ color: '#94a3b8', marginTop: '8px' }}>{subtitle}</p>
    </div>
  )
}

function MiniRankingCard({ title, rows, valueKey, valueFormatter, tone }) {
  const color = toneColors[tone] || toneColors.blue
  const maxValue = Math.max(...rows.map((row) => Number(row[valueKey] || 0)), 1)

  return (
    <div style={panelStyle}>
      <h3 style={{ marginTop: 0, marginBottom: '16px' }}>{title}</h3>

      <div style={{ display: 'grid', gap: '14px' }}>
        {rows.map((row) => {
          const value = Number(row[valueKey] || 0)
          const width = Math.max(4, Math.round((value / maxValue) * 100))

          return (
            <div key={`${title}-${row.pharmacyId}`}>
              <div style={rankingRowTopStyle}>
                <span>{row.pharmacyName}</span>
                <strong style={{ color: color.text }}>
                  {valueFormatter(value)}
                </strong>
              </div>

              <div style={barTrackStyle}>
                <div
                  style={{
                    ...barFillStyle,
                    width: `${width}%`,
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

function PharmacyPerformanceTable({ rows }) {
  return (
    <div style={tablePanelStyle}>
      <div style={tableHeaderStyle}>
        <div>
          <h3 style={{ margin: 0, fontSize: '22px' }}>
            Pharmacy Performance Table
          </h3>
          <p style={{ color: '#94a3b8', marginTop: '6px' }}>
            Value, shortage, expiry risk, and health score by pharmacy.
          </p>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Pharmacy Name</th>
              <th style={thStyle}>Inventory Value</th>
              <th style={thStyle}>Inventory Lines</th>
              <th style={thStyle}>Out Of Stock</th>
              <th style={thStyle}>Low Stock</th>
              <th style={thStyle}>Near Expiry</th>
              <th style={thStyle}>Expired</th>
              <th style={thStyle}>Health Score</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const color = toneColors[row.healthTone] || toneColors.blue

              return (
                <tr key={row.pharmacyId}>
                  <td style={tdStyle}>
                    <strong>{row.pharmacyName}</strong>
                    <div style={{ color: '#94a3b8', fontSize: '12px' }}>
                      {row.pharmacyCode || '-'} · {row.pharmacyType || '-'}
                    </div>
                  </td>
                  <td style={tdStyle}>AED {formatMoney(row.inventoryValue)}</td>
                  <td style={tdStyle}>{formatNumber(row.inventoryLines)}</td>
                  <td style={tdStyle}>{formatNumber(row.outOfStock)}</td>
                  <td style={tdStyle}>{formatNumber(row.lowStock)}</td>
                  <td style={tdStyle}>{formatNumber(row.nearExpiry)}</td>
                  <td style={tdStyle}>{formatNumber(row.expired)}</td>
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

function buildInventorySnapshot({ pharmaciesRows, inventoryRows }) {
  const pharmacyMap = new Map(
    pharmaciesRows.map((pharmacy) => [pharmacy.id, pharmacy])
  )

  return inventoryRows.map((item) => {
    const pharmacy = pharmacyMap.get(item.pharmacy_id)

    return {
      pharmacy_name: pharmacy?.name || '',
      pharmacy_code: pharmacy?.code || '',
      drug_code: item.drug_code || '',
      batch_number: item.batch_number || '',
      expiry_date: item.expiry_date || '',
      quantity_on_hand: Number(item.quantity_on_hand || 0),
      minimum_stock: Number(item.minimum_stock || 0),
      maximum_stock: Number(item.maximum_stock || 0),
      unit_cost: Number(item.unit_cost || 0),
      inventory_value_aed:
        Number(item.quantity_on_hand || 0) * Number(item.unit_cost || 0),
      storage_location: item.storage_location || '',
      inventory_status: item.inventory_status || '',
    }
  })
}
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
        import_type: importType,
        file_name: fileName,
        total_rows: totalRows,
        valid_rows: validRows,
        invalid_rows: invalidRows,
        status: 'COMPLETED',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        notes: 'Created from FalconMed Import Center',
      },
    ])

  if (error) {
    console.error('Import job error:', error)
    return false
  }

  return true
}
function DataReportingPanel({ pharmacyPerformance, inventorySnapshot }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const nearExpiryLimit = new Date(today)
  nearExpiryLimit.setDate(today.getDate() + 90)

  const lowStockRows = inventorySnapshot.filter(
    (item) =>
      Number(item.quantity_on_hand || 0) > 0 &&
      Number(item.minimum_stock || 0) > 0 &&
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
  if (!rows?.length) {
    alert('No data available for export.')
    return
  }

  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, filename)
}
  function exportCSV(filename, rows) {
    if (!rows?.length) {
      alert('No data available for export.')
      return
    }

    const headers = Object.keys(rows[0])

    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers
          .map((header) => `"${String(row[header] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={reportingPanelStyle}>
      <h2 style={{ marginTop: 0 }}>Phase 8.2 — Data & Reporting</h2>

      <p style={{ color: '#94a3b8' }}>
        Export FalconMed operational intelligence for Power BI, Excel,
        reporting, and external analytics.
      </p>

      <div style={reportingButtonGridStyle}>
        <button
          style={exportButtonStyle}
          onClick={() =>
            exportCSV('falconmed_pharmacy_performance.csv', pharmacyPerformance)
          }
        >
          Export Pharmacy Performance CSV
        </button>

        <button
  style={excelButtonStyle}
  onClick={() =>
    exportExcel(
      'falconmed_pharmacy_performance.xlsx',
      'Pharmacy Performance',
      pharmacyPerformance
    )
  }
>
  Export Pharmacy Performance Excel
</button>

<button
  style={exportButtonStyle}
  onClick={() =>
    exportCSV(
      'falconmed_inventory_snapshot.csv',
      inventorySnapshot
    )
  }
>
  Export Inventory Snapshot CSV
</button>
             <button
  style={excelButtonStyle}
  onClick={() =>
    exportExcel(
      'falconmed_inventory_snapshot.xlsx',
      'Inventory Snapshot',
      inventorySnapshot
    )
  }
>
  Export Inventory Snapshot Excel
</button>

<button
  style={excelButtonStyle}
  onClick={() =>
    exportExcel(
      'falconmed_low_stock.xlsx',
      'Low Stock',
      lowStockRows
    )
  }
>
  Export Low Stock Excel
</button>

<button
  style={excelButtonStyle}
  onClick={() =>
    exportExcel(
      'falconmed_near_expiry.xlsx',
      'Near Expiry',
      nearExpiryRows
    )
  }
>
  Export Near Expiry Excel
</button>

<button
  style={excelButtonStyle}
  onClick={() =>
    exportExcel(
      'falconmed_expired_inventory.xlsx',
      'Expired Inventory',
      expiredRows
    )
  }
>
  Export Expired Excel
</button>

        <button
          style={exportButtonStyle}
          onClick={() => exportCSV('falconmed_low_stock.csv', lowStockRows)}
        >
          Export Low Stock CSV
        </button>

        <button
          style={exportButtonStyle}
          onClick={() => exportCSV('falconmed_near_expiry.csv', nearExpiryRows)}
        >
          Export Near Expiry CSV
        </button>

        <button
          style={exportButtonStyle}
          onClick={() =>
            exportCSV('falconmed_expired_inventory.csv', expiredRows)
          }
        >
          Export Expired CSV
        </button>
      </div>
    </div>
  )
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

const threeColumnGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: '18px',
  marginTop: '18px',
}
const reportingPanelStyle = {
  background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
  border: '1px solid #334155',
  borderRadius: '18px',
  padding: '24px',
  marginTop: '24px',
}

const reportingButtonGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '12px',
  marginTop: '18px',
}

const exportButtonStyle = {
  background: '#0ea5e9',
  color: 'white',
  border: 'none',
  borderRadius: '12px',
  padding: '14px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '14px',
}
   const excelButtonStyle = {
  ...exportButtonStyle,
  background: '#16a34a',
}
const cardStyle = {
  background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
  padding: '24px',
  borderRadius: '18px',
  border: '1px solid #334155',
  color: 'white',
  minHeight: '130px',
}

const panelStyle = {
  background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
  padding: '22px',
  borderRadius: '18px',
  border: '1px solid #334155',
  color: 'white',
}

const tablePanelStyle = {
  ...panelStyle,
  marginTop: '18px',
}

const tableHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '16px',
  marginBottom: '18px',
  flexWrap: 'wrap',
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

const rankingRowTopStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  fontSize: '13px',
  marginBottom: '6px',
}

const barTrackStyle = {
  height: '8px',
  background: '#1e293b',
  borderRadius: '999px',
  overflow: 'hidden',
}

const barFillStyle = {
  height: '100%',
  borderRadius: '999px',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '1100px',
}

const thStyle = {
  textAlign: 'left',
  padding: '14px',
  color: '#cbd5e1',
  fontSize: '13px',
  borderBottom: '1px solid #334155',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '14px',
  borderBottom: '1px solid #1e293b',
  color: '#e5e7eb',
  fontSize: '14px',
  whiteSpace: 'nowrap',
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

function scoreBadgeStyle(color) {
  return {
    color: color.text,
    border: `1px solid ${color.border}`,
    background: color.shadow,
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: 800,
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