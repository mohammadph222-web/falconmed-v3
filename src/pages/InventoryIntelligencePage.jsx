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
    <div>
      <div className="fm-page-header">
        <div className="fm-page-header-top">
          <div>
            <div className="fm-page-header-meta">
              Formulary &amp; Inventory
            </div>
            <h1 className="fm-page-header-title">Inventory Intelligence</h1>
            <p className="fm-page-header-desc">
              Operational intelligence — inventory value, expiry risk,
              storage exposure, and high-cost medication visibility.
            </p>
          </div>
          <div className="fm-page-header-actions">
            <button className="fm-btn fm-btn-primary" onClick={loadMetrics}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="fm-card" style={{ color: 'var(--color-text-secondary)' }}>
          Loading inventory intelligence...
        </div>
      ) : (
        <>
          <div className="fm-grid-kpi">
            <IntelKpiCard
              title="Total inventory value"
              value={`AED ${formatMoney(inventoryValue)}`}
              variant="success"
            />
            <IntelKpiCard
              title="Active inventory lines"
              value={formatNumber(activeItems)}
              variant="info"
            />
            <IntelKpiCard
              title="Out of stock"
              value={formatNumber(outOfStock)}
              variant="danger"
            />
            <IntelKpiCard
              title="Low stock items"
              value={formatNumber(lowStockItems)}
              variant="warning"
            />
            <IntelKpiCard
              title="Expired items"
              value={formatNumber(expiredItems)}
              variant="danger"
            />
            <IntelKpiCard
              title="Near expiry"
              value={formatNumber(nearExpiry)}
              variant="warning"
            />
            <IntelKpiCard
              title="High value items"
              value={formatNumber(highValueItems)}
              variant="info"
            />
          </div>

          <IntelSection title="Top 20 most valuable drugs">
            <div className="fm-table-wrap">
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>Drug</th>
                    <th>Drug code</th>
                    <th>Total quantity</th>
                    <th>Total value</th>
                    <th>Locations</th>
                    <th>Batches</th>
                  </tr>
                </thead>
                <tbody>
                  {topValueItems.map((item) => (
                    <tr key={item.drug_code}>
                      <DrugCell item={item} />
                      <td className="fm-table-muted">{item.drug_code || '-'}</td>
                      <td>{formatNumber(item.quantity)}</td>
                      <td>AED {formatMoney(item.total_value)}</td>
                      <td>{item.location_count}</td>
                      <td>{item.batch_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </IntelSection>

          <IntelSection title="High risk — near expiry items">
            <div className="fm-table-wrap">
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>Drug</th>
                    <th>Drug code</th>
                    <th>Quantity</th>
                    <th>Unit cost</th>
                    <th>Value at risk</th>
                    <th>Expiry date</th>
                    <th>Days left</th>
                    <th>Storage</th>
                  </tr>
                </thead>
                <tbody>
                  {nearExpiryItems.map((item) => (
                    <tr
                      key={`${item.drug_code}-${item.expiry_date}-${item.storage_location}`}
                    >
                      <DrugCell item={item} />
                      <td className="fm-table-muted">{item.drug_code || '-'}</td>
                      <td>{formatNumber(item.quantity)}</td>
                      <td>AED {formatMoney(item.unit_cost)}</td>
                      <td>AED {formatMoney(item.total_value)}</td>
                      <td className="fm-table-muted">{item.expiry_date || '-'}</td>
                      <td>
                        <ExpiryBadge days={item.days_to_expiry} />
                      </td>
                      <td className="fm-table-muted">
                        {item.storage_location || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </IntelSection>

          <IntelSection title="Storage location exposure">
            <div className="fm-table-wrap">
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>Storage location</th>
                    <th>Inventory rows</th>
                    <th>Total quantity</th>
                    <th>Total value</th>
                  </tr>
                </thead>
                <tbody>
                  {storageSummary.map((row) => (
                    <tr key={row.storage_location}>
                      <td>{row.storage_location}</td>
                      <td>{formatNumber(row.item_count)}</td>
                      <td>{formatNumber(row.quantity)}</td>
                      <td>AED {formatMoney(row.total_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </IntelSection>
        </>
      )}
    </div>
  )
}

function IntelKpiCard({ title, value, variant }) {
  const barColors = {
    success: 'var(--color-success)',
    warning: 'var(--color-warning-mid)',
    danger:  'var(--color-danger-mid)',
    info:    'var(--color-primary)',
  }

  const valueColors = {
    success: 'var(--color-success)',
    warning: 'var(--color-warning-mid)',
    danger:  'var(--color-danger-mid)',
    info:    'var(--color-text-accent)',
  }

  return (
    <div className="fm-kpi-card">
      <div className="fm-kpi-label">{title}</div>
      <div
        className="fm-kpi-value"
        style={{ color: valueColors[variant] ?? 'var(--color-text-primary)' }}
      >
        {value}
      </div>
      <div className="fm-kpi-bar">
        <div
          className="fm-kpi-bar-fill"
          style={{
            width: '60%',
            background: barColors[variant] ?? 'var(--color-primary)',
          }}
        />
      </div>
    </div>
  )
}

function IntelSection({ title, children }) {
  return (
    <div style={{ marginTop: '32px' }}>
      <h2
        style={{
          fontSize: 'var(--text-lg)',
          fontWeight: 'var(--font-medium)',
          color: 'var(--color-text-primary)',
          marginBottom: '12px',
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  )
}

function DrugCell({ item }) {
  return (
    <td>
      <div
        style={{
          fontWeight: 'var(--font-medium)',
          color: 'var(--color-text-primary)',
        }}
      >
        {item.drug?.brand_name || '-'}
      </div>
      <div
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          marginTop: '2px',
        }}
      >
        {item.drug?.generic_name || '-'} {item.drug?.strength || ''}
      </div>
    </td>
  )
}

function ExpiryBadge({ days }) {
  let variant = 'info'
  if (days <= 30) variant = 'danger'
  else if (days <= 60) variant = 'warning'

  const styles = {
    danger:  { background: 'rgba(163,45,45,0.15)',  color: 'var(--color-danger-mid)',  border: '1px solid rgba(163,45,45,0.3)'  },
    warning: { background: 'rgba(186,117,23,0.15)', color: 'var(--color-warning-mid)', border: '1px solid rgba(186,117,23,0.3)' },
    info:    { background: 'rgba(24,95,165,0.15)',  color: 'var(--color-text-accent)', border: '1px solid rgba(24,95,165,0.3)'  },
  }

  return (
    <span
      style={{
        ...styles[variant],
        display: 'inline-block',
        borderRadius: 'var(--radius-pill)',
        padding: '3px 10px',
        fontSize: 'var(--text-sm)',
        fontWeight: 'var(--font-medium)',
        minWidth: '42px',
        textAlign: 'center',
      }}
    >
      {days}d
    </span>
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