import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function InventoryIntelligencePage() {
  const [loading, setLoading] = useState(true)

  const [inventoryValue, setInventoryValue] = useState(0)
  const [outOfStock, setOutOfStock] = useState(0)
  const [nearExpiry, setNearExpiry] = useState(0)
  const [highValueItems, setHighValueItems] = useState(0)
  const [expiredItems, setExpiredItems] = useState(0)
  const [lowStockItems, setLowStockItems] = useState(0)
  const [activeItems, setActiveItems] = useState(0)

  const [topValueItems, setTopValueItems] = useState([])
  const [nearExpiryItems, setNearExpiryItems] = useState([])
  const [storageSummary, setStorageSummary] = useState([])

  useEffect(() => {
    loadMetrics()
  }, [])

  async function loadAllInventoryRows() {
    let allRows = []
    let from = 0
    const batchSize = 1000

    while (true) {
      const { data, error } = await supabase
        .from('inventory')
        .select(
          'drug_code, quantity_on_hand, minimum_stock, unit_cost, expiry_date, storage_location, batch_number'
        )
        .range(from, from + batchSize - 1)

      if (error) throw error

      allRows = [...allRows, ...(data || [])]

      if (!data || data.length < batchSize) break

      from += batchSize
    }

    return allRows
  }

  async function loadMetrics() {
    setLoading(true)

    let data = []

    try {
      data = await loadAllInventoryRows()
    } catch (error) {
      console.error('Inventory Intelligence Error:', error)
      setLoading(false)
      return
    }

    const drugCodes = [
      ...new Set((data || []).map((item) => item.drug_code).filter(Boolean)),
    ]

   let drugMap = new Map()

if (drugCodes.length > 0) {
  for (let i = 0; i < drugCodes.length; i += 500) {
    const chunk = drugCodes.slice(i, i + 500)

    const { data: drugData, error: drugError } = await supabase
      .from('drug_master_reference')
      .select('drug_code, generic_name, brand_name, strength')
      .in('drug_code', chunk)

    if (drugError) {
      console.error('Drug master load error:', drugError)
      continue
    }

    ;(drugData || []).forEach((drug) => {
      drugMap.set(drug.drug_code, drug)
    })
  }
}

    let totalValue = 0
    let outCount = 0
    let nearExpiryCount = 0
    let highValueCount = 0
    let expiredCount = 0
    let lowStockCount = 0

    const groupedDrugs = {}
    const expiryRiskRows = []
    const storageGroups = {}

    const today = new Date()
    const todayOnly = new Date()
    todayOnly.setHours(0, 0, 0, 0)

    const ninetyDaysFromNow = new Date()
    ninetyDaysFromNow.setDate(today.getDate() + 90)

    for (const item of data || []) {
      const qty = Number(item.quantity_on_hand || 0)
      const min = Number(item.minimum_stock || 0)
      const cost = Number(item.unit_cost || 0)
      const totalItemValue = qty * cost
      const drug = drugMap.get(item.drug_code)
      const storage = item.storage_location || 'UNKNOWN'

      totalValue += totalItemValue

      if (qty <= 0) outCount++
      if (qty > 0 && min > 0 && qty < min) lowStockCount++
      if (cost >= 1000) highValueCount++

      if (!storageGroups[storage]) {
        storageGroups[storage] = {
          storage_location: storage,
          item_count: 0,
          quantity: 0,
          total_value: 0,
        }
      }

      storageGroups[storage].item_count += 1
      storageGroups[storage].quantity += qty
      storageGroups[storage].total_value += totalItemValue

      if (item.expiry_date) {
        const expiryDate = new Date(item.expiry_date)

        if (expiryDate < todayOnly) {
          expiredCount++
        }

        if (expiryDate >= todayOnly && expiryDate <= ninetyDaysFromNow) {
          nearExpiryCount++

          expiryRiskRows.push({
            ...item,
            drug,
            quantity: qty,
            unit_cost: cost,
            total_value: totalItemValue,
            days_to_expiry: Math.ceil(
              (expiryDate.getTime() - todayOnly.getTime()) /
                (1000 * 60 * 60 * 24)
            ),
          })
        }
      }

      if (!groupedDrugs[item.drug_code]) {
        groupedDrugs[item.drug_code] = {
          drug_code: item.drug_code,
          drug,
          quantity: 0,
          total_value: 0,
          locations: new Set(),
          batches: new Set(),
        }
      }

      groupedDrugs[item.drug_code].quantity += qty
      groupedDrugs[item.drug_code].total_value += totalItemValue
      groupedDrugs[item.drug_code].locations.add(storage)
      groupedDrugs[item.drug_code].batches.add(
        item.batch_number ||
          `${item.expiry_date || 'NO_EXPIRY'}-${
            item.storage_location || 'NO_LOCATION'
          }`
      )
    }

    const topItems = Object.values(groupedDrugs)
      .map((item) => ({
        ...item,
        location_count: item.locations.size,
        batch_count: item.batches.size,
      }))
      .sort((a, b) => b.total_value - a.total_value)
      .slice(0, 20)

    const topExpiryRisk = expiryRiskRows
      .sort((a, b) => {
        if (a.days_to_expiry !== b.days_to_expiry) {
          return a.days_to_expiry - b.days_to_expiry
        }

        return b.total_value - a.total_value
      })
      .slice(0, 20)

    const storageRows = Object.values(storageGroups).sort(
      (a, b) => b.total_value - a.total_value
    )

    setInventoryValue(totalValue)
    setOutOfStock(outCount)
    setNearExpiry(nearExpiryCount)
    setHighValueItems(highValueCount)
    setExpiredItems(expiredCount)
    setLowStockItems(lowStockCount)
    setActiveItems(data.length)

    setTopValueItems(topItems)
    setNearExpiryItems(topExpiryRisk)
    setStorageSummary(storageRows)

    setLoading(false)
  }

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Inventory Intelligence</h1>
          <p style={subtitleStyle}>
            Phase 8 Operational Intelligence — inventory value, expiry risk,
            storage exposure, and high-cost medication visibility.
          </p>
        </div>

        <button onClick={loadMetrics} style={refreshButtonStyle}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={loadingStyle}>Loading inventory intelligence...</div>
      ) : (
        <>
          <div style={cardsContainerStyle}>
            <InfoCard title="Total Inventory Value" value={`AED ${formatMoney(inventoryValue)}`} tone="green" />
            <InfoCard title="Active Inventory Lines" value={activeItems} tone="blue" />
            <InfoCard title="Out Of Stock Items" value={outOfStock} tone="red" />
            <InfoCard title="Low Stock Items" value={lowStockItems} tone="amber" />
            <InfoCard title="Expired Items" value={expiredItems} tone="red" />
            <InfoCard title="Near Expiry Items" value={nearExpiry} tone="amber" />
            <InfoCard title="High Value Items" value={highValueItems} tone="purple" />
          </div>

          <Section title="Top 20 Most Valuable Drugs">
            <Table
              columns={[
                'Drug',
                'Drug Code',
                'Total Quantity',
                'Total Value',
                'Locations',
                'Batches',
              ]}
            >
              {topValueItems.map((item) => (
                <tr key={item.drug_code}>
                  <DrugCell item={item} />
                  <td style={tdStyle}>{item.drug_code || '-'}</td>
                  <td style={tdStyle}>{formatNumber(item.quantity)}</td>
                  <td style={tdStyle}>AED {formatMoney(item.total_value)}</td>
                  <td style={tdStyle}>{item.location_count}</td>
                  <td style={tdStyle}>{item.batch_count}</td>
                </tr>
              ))}
            </Table>
          </Section>

          <Section title="High Risk Near Expiry Items">
            <Table
              columns={[
                'Drug',
                'Drug Code',
                'Quantity',
                'Unit Cost',
                'Value At Risk',
                'Expiry Date',
                'Days Left',
                'Storage',
              ]}
            >
              {nearExpiryItems.map((item) => (
                <tr key={`${item.drug_code}-${item.expiry_date}-${item.storage_location}`}>
                  <DrugCell item={item} />
                  <td style={tdStyle}>{item.drug_code || '-'}</td>
                  <td style={tdStyle}>{formatNumber(item.quantity)}</td>
                  <td style={tdStyle}>AED {formatMoney(item.unit_cost)}</td>
                  <td style={tdStyle}>AED {formatMoney(item.total_value)}</td>
                  <td style={tdStyle}>{item.expiry_date || '-'}</td>
                  <td style={tdStyle}>
                    <span style={riskBadgeStyle(item.days_to_expiry)}>
                      {item.days_to_expiry}
                    </span>
                  </td>
                  <td style={tdStyle}>{item.storage_location || '-'}</td>
                </tr>
              ))}
            </Table>
          </Section>

          <Section title="Storage Location Exposure">
            <Table
              columns={[
                'Storage Location',
                'Inventory Rows',
                'Total Quantity',
                'Total Value',
              ]}
            >
              {storageSummary.map((row) => (
                <tr key={row.storage_location}>
                  <td style={tdStyle}>{row.storage_location}</td>
                  <td style={tdStyle}>{formatNumber(row.item_count)}</td>
                  <td style={tdStyle}>{formatNumber(row.quantity)}</td>
                  <td style={tdStyle}>AED {formatMoney(row.total_value)}</td>
                </tr>
              ))}
            </Table>
          </Section>
        </>
      )}
    </div>
  )
}

function InfoCard({ title, value, tone }) {
  const color = toneColors[tone] || toneColors.blue

  return (
    <div style={{ ...cardStyle, borderColor: color.border }}>
      <div style={cardTitleStyle}>{title}</div>
      <div style={{ ...cardValueStyle, color: color.text }}>{value}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      {children}
    </div>
  )
}

function Table({ columns, children }) {
  return (
    <div style={tableWrapperStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} style={thStyle}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function DrugCell({ item }) {
  return (
    <td style={tdStyle}>
      <strong>{item.drug?.brand_name || '-'}</strong>
      <div style={{ color: '#94a3b8', marginTop: '4px' }}>
        {item.drug?.generic_name || '-'} {item.drug?.strength || ''}
      </div>
    </td>
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

function riskBadgeStyle(days) {
  if (days <= 30) {
    return {
      ...badgeStyle,
      background: '#7f1d1d',
      color: '#fecaca',
      border: '1px solid #ef4444',
    }
  }

  if (days <= 60) {
    return {
      ...badgeStyle,
      background: '#78350f',
      color: '#fde68a',
      border: '1px solid #f59e0b',
    }
  }

  return {
    ...badgeStyle,
    background: '#1e293b',
    color: '#bfdbfe',
    border: '1px solid #3b82f6',
  }
}

const pageStyle = {
  padding: '30px',
  color: 'white',
}

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '20px',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
}

const titleStyle = {
  fontSize: '48px',
  marginBottom: '10px',
}

const subtitleStyle = {
  fontSize: '18px',
  color: '#94a3b8',
  marginBottom: '30px',
  maxWidth: '900px',
  lineHeight: 1.6,
}

const refreshButtonStyle = {
  background: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 18px',
  cursor: 'pointer',
  fontWeight: 'bold',
}

const loadingStyle = {
  background: '#111827',
  border: '1px solid #334155',
  borderRadius: '12px',
  padding: '24px',
  color: '#cbd5e1',
}

const cardsContainerStyle = {
  display: 'flex',
  gap: '20px',
  flexWrap: 'wrap',
}

const cardStyle = {
  background: '#111827',
  border: '1px solid #334155',
  borderRadius: '12px',
  padding: '24px',
  minWidth: '280px',
}

const cardTitleStyle = {
  color: '#94a3b8',
  fontSize: '17px',
  marginBottom: '12px',
}

const cardValueStyle = {
  fontSize: '34px',
  fontWeight: '800',
}

const sectionStyle = {
  marginTop: '42px',
}

const sectionTitleStyle = {
  fontSize: '28px',
  marginBottom: '16px',
}

const tableWrapperStyle = {
  overflowX: 'auto',
  background: '#111827',
  border: '1px solid #334155',
  borderRadius: '12px',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '1200px',
}

const thStyle = {
  textAlign: 'left',
  padding: '14px',
  background: '#1e293b',
  color: '#cbd5e1',
  borderBottom: '1px solid #334155',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '14px',
  borderBottom: '1px solid #1f2937',
  color: '#e5e7eb',
  verticalAlign: 'top',
}

const badgeStyle = {
  display: 'inline-block',
  borderRadius: '999px',
  padding: '4px 10px',
  fontWeight: 'bold',
  minWidth: '42px',
  textAlign: 'center',
}

const toneColors = {
  blue: {
    text: '#60a5fa',
    border: '#334155',
  },
  green: {
    text: '#34d399',
    border: '#14532d',
  },
  red: {
    text: '#f87171',
    border: '#7f1d1d',
  },
  amber: {
    text: '#fbbf24',
    border: '#78350f',
  },
  purple: {
    text: '#c084fc',
    border: '#581c87',
  },
}