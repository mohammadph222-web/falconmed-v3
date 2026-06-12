import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function InventoryExplorerPage() {
  const [pharmacies, setPharmacies] = useState([])
  const [selectedPharmacy, setSelectedPharmacy] = useState('')
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadPharmacies()
  }, [])

  async function loadPharmacies() {
    const { data, error } = await supabase
      .from('pharmacies')
      .select('id, name, code, is_active')
      .order('name')

    if (error) {
      console.error('Pharmacies error:', error)
      return
    }

    setPharmacies(data || [])

    if (data?.length) {
      setSelectedPharmacy(data[0].id)
      loadInventory(data[0].id)
    }
  }

  async function loadInventory(pharmacyId) {
    setLoading(true)

    const { data: inventoryData, error: inventoryError } = await supabase
      .from('inventory')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('quantity_on_hand', { ascending: false })

    if (inventoryError) {
      console.error('Inventory error:', inventoryError)
      setInventory([])
      setLoading(false)
      return
    }

    const drugCodes = [
      ...new Set((inventoryData || []).map((item) => item.drug_code)),
    ]

    if (drugCodes.length === 0) {
      setInventory([])
      setLoading(false)
      return
    }

    const { data: drugData, error: drugError } = await supabase
      .from('drug_master_reference')
      .select(
        'drug_code, generic_name, brand_name, strength, dosage_form, unit_price_to_pharmacy'
      )
      .in('drug_code', drugCodes)

    if (drugError) {
      console.error('Drug reference error:', drugError)
    }

    const drugMap = new Map(
      (drugData || []).map((drug) => [drug.drug_code, drug])
    )

    const merged = (inventoryData || []).map((item) => ({
      ...item,
      drug: drugMap.get(item.drug_code) || null,
    }))

    setInventory(merged)
    setLoading(false)
  }

  const summary = useMemo(() => {
    const totalItems = inventory.length

    const totalQuantity = inventory.reduce(
      (sum, item) => sum + Number(item.quantity_on_hand || 0),
      0
    )

    const totalInventoryValue = inventory.reduce((sum, item) => {
      const qty = Number(item.quantity_on_hand || 0)
      const unitCost = Number(item.drug?.unit_price_to_pharmacy || 0)

      return sum + qty * unitCost
    }, 0)

    const lowStockCount = inventory.filter((item) => {
      const qty = Number(item.quantity_on_hand || 0)
      const min = Number(item.minimum_stock || 0)

      return qty > 0 && qty <= min
    }).length

    const outOfStockCount = inventory.filter(
      (item) => Number(item.quantity_on_hand || 0) === 0
    ).length

    const healthyCount = inventory.filter((item) => {
      const qty = Number(item.quantity_on_hand || 0)
      const min = Number(item.minimum_stock || 0)

      return qty > min
    }).length

    return {
      totalItems,
      totalQuantity,
      totalInventoryValue,
      lowStockCount,
      outOfStockCount,
      healthyCount,
    }
  }, [inventory])

  const inventoryHealth = useMemo(() => {
    if (!summary.totalItems) {
      return { score: 0, label: 'No Data', tone: 'blue', riskCount: 0 }
    }

   const riskCount = summary.lowStockCount + summary.outOfStockCount

const score = Math.round(
  ((summary.healthyCount || 0) / summary.totalItems) * 100
)

if (score >= 85) {
  return { score, label: 'Healthy', tone: 'green', riskCount }
}

if (score >= 70) {
  return { score, label: 'Watch', tone: 'amber', riskCount }
}

return { score, label: 'Critical', tone: 'red', riskCount }
  }, [summary])

  const selectedPharmacyName = useMemo(() => {
    return pharmacies.find((pharmacy) => pharmacy.id === selectedPharmacy)?.name || 'Selected Pharmacy'
  }, [pharmacies, selectedPharmacy])

  const filteredInventory = inventory.filter((item) => {
    const search = searchTerm.toLowerCase().trim()

    if (!search) return true

    return (
      item.drug_code?.toLowerCase().includes(search) ||
      item.drug?.generic_name?.toLowerCase().includes(search) ||
      item.drug?.brand_name?.toLowerCase().includes(search) ||
      item.batch_number?.toLowerCase().includes(search)
    )
  })

  function handleExportCsv() {
    const headers = [
      'Drug Code',
      'Generic Name',
      'Brand Name',
      'Strength',
      'Dosage Form',
      'Batch Number',
      'Expiry Date',
      'Quantity',
      'Minimum Stock',
      'Maximum Stock',
      'Stock Status',
      'Inventory Value AED',
    ]

    const rows = filteredInventory.map((item) => {
      const qty = Number(item.quantity_on_hand || 0)
      const unitCost = Number(item.drug?.unit_price_to_pharmacy || 0)

      return [
        item.drug_code || '',
        item.drug?.generic_name || '',
        item.drug?.brand_name || '',
        item.drug?.strength || '',
        item.drug?.dosage_form || '',
        item.batch_number || '',
        item.expiry_date || '',
        qty,
        item.minimum_stock || 0,
        item.maximum_stock || 0,
        getStockStatus(item).label,
        (qty * unitCost).toFixed(2),
      ]
    })

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(',')
      )
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `falconmed_inventory_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`
    link.click()

    URL.revokeObjectURL(url)
  }

  function handleExportExcel() {
    handleExportCsv()
  }

  return (
    <div style={{ padding: '24px', color: 'white' }}>
      <div style={pageHeaderStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: '36px' }}>Inventory Explorer</h1>
          <p style={{ color: '#94a3b8', marginTop: '8px', fontSize: '16px' }}>
            Professional inventory view by pharmacy with stock health, value,
            and batch-level visibility.
          </p>
        </div>

        <div style={headerActionsStyle}>
          <button onClick={handleExportCsv} style={secondaryButtonStyle}>
            Export CSV
          </button>
          <button onClick={handleExportExcel} style={primaryButtonStyle}>
            Export Excel
          </button>
        </div>
      </div>

      <div style={filterBarStyle}>
        <div style={filterGroupStyle}>
          <label style={labelStyle}>Pharmacy</label>
          <select
            value={selectedPharmacy}
            onChange={(e) => {
              setSelectedPharmacy(e.target.value)
              setSearchTerm('')
              loadInventory(e.target.value)
            }}
            style={selectStyle}
          >
            <option value="">Select pharmacy</option>
            {pharmacies.map((pharmacy) => (
              <option key={pharmacy.id} value={pharmacy.id}>
                {pharmacy.name} ({pharmacy.code})
              </option>
            ))}
          </select>
        </div>

        <div style={{ ...filterGroupStyle, flex: 1 }}>
          <label style={labelStyle}>Search</label>
          <input
            type="text"
            placeholder="Search by drug code, generic, brand, or batch..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={inputStyle}
          />
        </div>

        <button
          onClick={() => setSearchTerm('')}
          style={{
            ...secondaryButtonStyle,
            alignSelf: 'end',
            minHeight: '42px',
          }}
        >
          Reset
        </button>
      </div>

      {loading ? (
        <div style={gridStyle}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} style={skeletonCardStyle} />
          ))}
        </div>
      ) : (
        <div style={gridStyle}>
          <SummaryCard title="Inventory Records" value={summary.totalItems} tone="blue" />
          <SummaryCard
            title="Total Quantity"
            value={formatCompact(summary.totalQuantity)}
            subValue={formatNumber(summary.totalQuantity)}
            tone="blue"
          />
          <SummaryCard
            title="Inventory Value"
            value={`AED ${formatMoneyCompact(summary.totalInventoryValue)}`}
            subValue={`AED ${formatMoney(summary.totalInventoryValue)}`}
            tone="green"
          />
          <SummaryCard title="Low Stock" value={`${summary.lowStockCount} Items`} tone="amber" />
          <SummaryCard title="Out of Stock" value={`${summary.outOfStockCount} Items`} tone="red" />
          <SummaryCard
            title="Inventory Health"
            value={`${inventoryHealth.score}%`}
            subValue={`${inventoryHealth.label} · ${summary.healthyCount} healthy · ${inventoryHealth.riskCount} risk`}
            tone={inventoryHealth.tone}
          />
        </div>
      )}

     
      {!loading && inventory.length === 0 && (
        <div style={emptyStateStyle}>No inventory found for this pharmacy.</div>
      )}

      {!loading && inventory.length > 0 && filteredInventory.length === 0 && (
        <div style={emptyStateStyle}>No matching inventory found.</div>
      )}

      {!loading && filteredInventory.length > 0 && (
        <div style={tableSectionStyle}>
          <div style={tableHeaderStyle}>
            <div>
              <strong>{formatNumber(filteredInventory.length)}</strong> records shown
            </div>
            <div style={{ color: '#94a3b8' }}>
              Sorted by quantity on hand
            </div>
          </div>

          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={stickyThStyle}>Status</th>
                  <th style={stickyThStyle}>Drug Code</th>
                  <th style={stickyThStyle}>Generic</th>
                  <th style={stickyThStyle}>Brand</th>
                  <th style={stickyThStyle}>Strength</th>
                  <th style={stickyThStyle}>Form</th>
                  <th style={stickyThStyle}>Batch</th>
                  <th style={stickyThStyle}>Expiry</th>
                  <th style={stickyThStyle}>Quantity</th>
                  <th style={stickyThStyle}>Min</th>
                  <th style={stickyThStyle}>Max</th>
                  <th style={stickyThStyle}>Value</th>
                </tr>
              </thead>

              <tbody>
                {filteredInventory.map((item, index) => {
                  const status = getStockStatus(item)
                  const qty = Number(item.quantity_on_hand || 0)
                  const unitCost = Number(item.drug?.unit_price_to_pharmacy || 0)
                  const value = qty * unitCost

                  return (
                    <tr
                      key={item.id}
                      style={{
                        ...rowStyle(index),
                        borderBottom: '1px solid #1e293b',
                      }}
                    >
                      <td style={tdStyle}>
                        <StockBadge status={status} />
                      </td>
                      <td style={tdStyle}>{item.drug_code}</td>
                      <td style={truncateTdStyle} title={item.drug?.generic_name || '-'}>
                        {item.drug?.generic_name || '-'}
                      </td>
                      <td style={truncateTdStyle} title={item.drug?.brand_name || '-'}>
                        {item.drug?.brand_name || '-'}
                      </td>
                      <td style={tdStyle}>{item.drug?.strength || '-'}</td>
                      <td style={tdStyle}>{item.drug?.dosage_form || '-'}</td>
                      <td style={tdStyle}>{item.batch_number || '-'}</td>
                      <td style={tdStyle}>{item.expiry_date || '-'}</td>
                      <td style={tdStyle}>{formatNumber(item.quantity_on_hand)}</td>
                      <td style={tdStyle}>{formatNumber(item.minimum_stock)}</td>
                      <td style={tdStyle}>{formatNumber(item.maximum_stock)}</td>
                      <td style={tdStyle}>AED {formatMoney(value)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ title, value, subValue, tone }) {
  const color = toneColors[tone] || toneColors.blue

  return (
    <div
      style={{
        ...cardStyle,
        borderColor: color.border,
        boxShadow: `0 0 0 1px ${color.shadow}`,
      }}
    >
      <div style={{ color: '#cbd5e1', fontSize: '15px', marginBottom: '14px' }}>
        {title}
      </div>

      <div style={{ color: color.text, fontSize: '30px', fontWeight: 900 }}>
        {value}
      </div>

      {subValue && (
        <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '10px' }}>
          {subValue}
        </div>
      )}
    </div>
  )
}

function SummaryMetric({ label, value, tone = 'blue' }) {
  const color = toneColors[tone] || toneColors.blue

  return (
    <div style={summaryMetricStyle}>
      <div style={{ color: '#94a3b8', fontSize: '13px' }}>{label}</div>
      <strong style={{ color: color.text, fontSize: '18px' }}>{value}</strong>
    </div>
  )
}

function StockBadge({ status }) {
  return (
    <span
      style={{
        color: status.color,
        border: `1px solid ${status.border}`,
        background: status.background,
        borderRadius: '999px',
        padding: '5px 10px',
        fontSize: '12px',
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {status.label}
    </span>
  )
}

function getStockStatus(item) {
  const qty = Number(item.quantity_on_hand || 0)
  const min = Number(item.minimum_stock || 0)

  if (qty === 0) {
    return {
      label: 'Out of Stock',
      color: '#f87171',
      border: '#7f1d1d',
      background: 'rgba(248, 113, 113, 0.14)',
    }
  }

  if (qty <= min) {
    return {
      label: 'Low Stock',
      color: '#fbbf24',
      border: '#78350f',
      background: 'rgba(251, 191, 36, 0.14)',
    }
  }

  return {
    label: 'Healthy',
    color: '#34d399',
    border: '#14532d',
    background: 'rgba(52, 211, 153, 0.14)',
  }
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

const pageHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '20px',
  alignItems: 'flex-start',
  marginBottom: '24px',
  flexWrap: 'wrap',
}

const headerActionsStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap',
}

const filterBarStyle = {
  display: 'flex',
  gap: '14px',
  alignItems: 'end',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '18px',
  padding: '16px',
  marginBottom: '22px',
  flexWrap: 'wrap',
}

const filterGroupStyle = {
  display: 'grid',
  gap: '6px',
}

const labelStyle = {
  color: '#94a3b8',
  fontSize: '13px',
}

const selectStyle = {
  padding: '11px 12px',
  borderRadius: '10px',
  border: '1px solid #334155',
  background: '#020617',
  color: 'white',
  fontSize: '14px',
  minWidth: '320px',
}

const inputStyle = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: '10px',
  border: '1px solid #334155',
  background: '#020617',
  color: 'white',
  fontSize: '14px',
  minWidth: '320px',
}

const primaryButtonStyle = {
  border: '1px solid #2563eb',
  background: '#2563eb',
  color: 'white',
  borderRadius: '10px',
  padding: '10px 14px',
  cursor: 'pointer',
  fontWeight: 700,
}

const secondaryButtonStyle = {
  border: '1px solid #334155',
  background: '#0f172a',
  color: 'white',
  borderRadius: '10px',
  padding: '10px 14px',
  cursor: 'pointer',
  fontWeight: 700,
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px',
  marginBottom: '22px',
}

const cardStyle = {
  background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
  padding: '20px',
  borderRadius: '18px',
  border: '1px solid #334155',
  color: 'white',
  minHeight: '112px',
}

const skeletonCardStyle = {
  ...cardStyle,
  minHeight: '112px',
  opacity: 0.45,
}

const pharmacySummaryStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(240px, 1.4fr) repeat(5, minmax(120px, 1fr))',
  gap: '14px',
  alignItems: 'center',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '18px',
  padding: '18px',
  marginBottom: '22px',
}

const summaryMetricStyle = {
  background: '#020617',
  border: '1px solid #1e293b',
  borderRadius: '14px',
  padding: '12px',
  display: 'grid',
  gap: '6px',
}

const tableSectionStyle = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '18px',
  overflow: 'hidden',
}

const tableHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '16px',
  color: '#cbd5e1',
  borderBottom: '1px solid #334155',
  flexWrap: 'wrap',
}

const tableWrapperStyle = {
  maxHeight: '620px',
  overflow: 'auto',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '1250px',
}

const stickyThStyle = {
  position: 'sticky',
  top: 0,
  zIndex: 2,
  textAlign: 'left',
  padding: '14px',
  color: 'white',
  borderBottom: '1px solid #334155',
  background: '#1e293b',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '14px',
  color: '#cbd5e1',
  borderBottom: '1px solid #1e293b',
  verticalAlign: 'top',
  whiteSpace: 'nowrap',
}

const truncateTdStyle = {
  ...tdStyle,
  maxWidth: '280px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

function rowStyle(index) {
  return {
    background: index % 2 === 0 ? '#0f172a' : '#111c31',
  }
}

const emptyStateStyle = {
  color: '#94a3b8',
  marginTop: '20px',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '16px',
  padding: '20px',
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
}
