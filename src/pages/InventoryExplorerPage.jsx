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
      return { score: 0, label: 'No data', tone: 'info', riskCount: 0 }
    }

    const riskCount = summary.lowStockCount + summary.outOfStockCount
    const score = Math.round(
      ((summary.healthyCount || 0) / summary.totalItems) * 100
    )

    if (score >= 85) return { score, label: 'Healthy', tone: 'success', riskCount }
    if (score >= 70) return { score, label: 'Watch', tone: 'warning', riskCount }
    return { score, label: 'Critical', tone: 'danger', riskCount }
  }, [summary])

  const selectedPharmacyName = useMemo(() => {
    return (
      pharmacies.find((p) => p.id === selectedPharmacy)?.name ||
      'Selected pharmacy'
    )
  }, [pharmacies, selectedPharmacy])

  const filteredInventory = inventory.filter((item) => {
    const search = searchTerm.toLowerCase().trim()
    if (!search) return true
    return (
      item.drug_code?.toLowerCase().includes(search) ||
      item.drug?.generic_name?.toLowerCase().includes(search) ||
      item.drug?.brand_name?.toLowerCase().includes(search) ||
      item.batch_number?.toLowerCase().includes(search) ||
      item.storage_location?.toLowerCase().includes(search)
    )
  })

  // ── Export builder — shared by CSV and Excel ──────────────────────────────
  // Fix 3: uses `inventory` (all records), not `filteredInventory`
  // Fix 4: includes OUT_OF_STOCK and EXPIRED records
  function buildExportRows(source) {
    return source.map((item) => {
      const qty      = Number(item.quantity_on_hand || 0)
      // Fix 5: use item.unit_cost from inventory table
      const unitCost = Number(item.unit_cost || 0)
      const value    = qty * unitCost

      return {
        'Drug Code':           item.drug_code || '',
        'Generic Name':        (item.drug?.generic_name  || '').trim(),
        'Brand Name':          (item.drug?.brand_name    || '').trim(),
        'Strength':            (item.drug?.strength      || '').trim(),
        // Fix 1: trim whitespace from dosage_form
        'Dosage Form':         (item.drug?.dosage_form   || '').trim(),
        'Batch Number':        item.batch_number     || '',
        'Expiry Date':         item.expiry_date      || '',
        // Fix 2: round to 2 decimal places
        'Quantity':            Math.round(qty * 100) / 100,
        'Minimum Stock':       Number(item.minimum_stock || 0),
        'Maximum Stock':       Number(item.maximum_stock || 0),
        'Storage Location':    item.storage_location || '',
        'Inventory Status':    item.inventory_status || '',
        'Stock Status':        getStockStatus(item).label,
        // Fix 6: zero-value records show 0.00 not blank
        'Inventory Value AED': value > 0 ? value.toFixed(2) : '0.00',
        'Unit Cost AED':       unitCost > 0 ? unitCost.toFixed(4) : '0.0000',
      }
    })
  }

  function handleExportCsv() {
    // Fix 3: export ALL records — not limited to filteredInventory
    const exportRows = buildExportRows(inventory)
    if (!exportRows.length) { alert('No inventory data to export.'); return }

    const headers = Object.keys(exportRows[0])
    const csv = [
      headers.join(','),
      ...exportRows.map((row) =>
        headers
          .map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\n')

    // BOM ensures Excel opens UTF-8 correctly
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href     = url
    link.download = `falconmed_inventory_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function handleExportExcel() {
    // Fix: real XLSX — no longer calls handleExportCsv
    import('xlsx').then((XLSX) => {
      const exportRows = buildExportRows(inventory)
      if (!exportRows.length) { alert('No inventory data to export.'); return }

      const worksheet = XLSX.utils.json_to_sheet(exportRows)
      worksheet['!cols'] = [
        { wch: 22 }, { wch: 32 }, { wch: 28 }, { wch: 14 },
        { wch: 16 }, { wch: 26 }, { wch: 14 }, { wch: 12 },
        { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 16 },
        { wch: 14 }, { wch: 20 }, { wch: 16 },
      ]
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventory')
      XLSX.writeFile(
        workbook,
        `falconmed_inventory_${new Date().toISOString().slice(0, 10)}.xlsx`
      )
    })
  }

  const healthColors = {
    success: 'var(--color-success)',
    warning: 'var(--color-warning-mid)',
    danger:  'var(--color-danger-mid)',
    info:    'var(--color-text-accent)',
  }

  return (
    <div>
      <div className="fm-page-header">
        <div className="fm-page-header-top">
          <div>
            <div className="fm-page-header-meta">Formulary &amp; Inventory</div>
            <h1 className="fm-page-header-title">Inventory Explorer</h1>
            <p className="fm-page-header-desc">
              Pharmacy inventory with stock health, value, and
              batch-level visibility across all locations.
            </p>
          </div>
          <div className="fm-page-header-actions">
            <button onClick={handleExportCsv} className="fm-btn">
              Export CSV
            </button>
            <button onClick={handleExportExcel} className="fm-btn fm-btn-primary">
              Export Excel
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '5px' }}>
            <label style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              Pharmacy
            </label>
            <select
              value={selectedPharmacy}
              onChange={(e) => {
                setSelectedPharmacy(e.target.value)
                setSearchTerm('')
                loadInventory(e.target.value)
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-base)',
                fontFamily: 'var(--font-sans)',
                minWidth: '280px',
              }}
            >
              <option value="">Select pharmacy</option>
              {pharmacies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gap: '5px', flex: 1, minWidth: '240px' }}>
            <label style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              Search
            </label>
            <input
              type="text"
              placeholder="Drug, brand, code, batch, location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-base)',
                fontFamily: 'var(--font-sans)',
                width: '100%',
              }}
            />
          </div>

          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="fm-btn"
              style={{ alignSelf: 'flex-end' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>
{loading ? (
        <div className="fm-grid-kpi" style={{ marginBottom: '20px' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="fm-kpi-card" style={{ opacity: 0.35, minHeight: '88px' }} />
          ))}
        </div>
      ) : (
        <div className="fm-grid-kpi" style={{ marginBottom: '20px' }}>
          <ExplorerKpiCard
            label="Inventory records"
            value={formatNumber(summary.totalItems)}
            color="var(--color-text-accent)"
            barColor="var(--color-primary)"
          />
          <ExplorerKpiCard
            label="Total quantity"
            value={formatCompact(summary.totalQuantity)}
            sub={formatNumber(summary.totalQuantity)}
            color="var(--color-text-accent)"
            barColor="var(--color-primary)"
          />
          <ExplorerKpiCard
            label="Inventory value"
            value={`AED ${formatMoneyCompact(summary.totalInventoryValue)}`}
            sub={`AED ${formatMoney(summary.totalInventoryValue)}`}
            color="var(--color-success)"
            barColor="var(--color-success)"
          />
          <ExplorerKpiCard
            label="Low stock"
            value={`${formatNumber(summary.lowStockCount)} items`}
            color="var(--color-warning-mid)"
            barColor="var(--color-warning-mid)"
          />
          <ExplorerKpiCard
            label="Out of stock"
            value={`${formatNumber(summary.outOfStockCount)} items`}
            color="var(--color-danger-mid)"
            barColor="var(--color-danger-mid)"
          />
          <ExplorerKpiCard
            label="Inventory health"
            value={`${inventoryHealth.score}%`}
            sub={`${inventoryHealth.label} · ${inventoryHealth.riskCount} at risk`}
            color={healthColors[inventoryHealth.tone]}
            barColor={healthColors[inventoryHealth.tone]}
          />
        </div>
      )}

      {!loading && inventory.length === 0 && (
        <div className="fm-empty-state">
          <div className="fm-empty-state-title">No inventory found</div>
          <div className="fm-empty-state-desc">
            Select a pharmacy above to load its inventory.
          </div>
        </div>
      )}

      {!loading && inventory.length > 0 && filteredInventory.length === 0 && (
        <div className="fm-empty-state">
          <div className="fm-empty-state-title">No matching records</div>
          <div className="fm-empty-state-desc">
            Try adjusting your search term.
          </div>
        </div>
      )}

      {!loading && filteredInventory.length > 0 && (
        <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border-subtle)',
            flexWrap: 'wrap',
            gap: '8px',
          }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
              <strong>{formatNumber(filteredInventory.length)}</strong>
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {' '}records · {selectedPharmacyName}
              </span>
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              Sorted by quantity on hand
            </span>
          </div>

          <div style={{ maxHeight: '620px', overflow: 'auto' }}>
            <table className="fm-table" style={{ minWidth: '1100px' }}>
              <thead>
                <tr>
                  {['Status','Drug','Brand','Stock','Min / Max','Value','Expiry','Location','Batch','Code'].map((col) => (
                    <th
                      key={col}
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        background: 'var(--color-bg-card)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item) => {
                  const status = getStockStatus(item)
                  const qty = Number(item.quantity_on_hand || 0)
                  const min = Number(item.minimum_stock || 0)
                  const max = Number(item.maximum_stock || 0)
                  const unitCost = Number(item.drug?.unit_price_to_pharmacy || 0)
                  const value = qty * unitCost

                  return (
                    <tr key={item.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <StockBadge status={status} />
                      </td>
                      <td style={{ whiteSpace: 'normal', minWidth: '260px' }}>
                        <div style={{
                          fontWeight: 'var(--font-medium)',
                          color: 'var(--color-text-primary)',
                          lineHeight: 1.35,
                        }}>
                          {item.drug?.generic_name || '-'}
                        </div>
                        <div style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-secondary)',
                          marginTop: '2px',
                        }}>
                          {item.drug?.strength || '-'} · {item.drug?.dosage_form || '-'}
                        </div>
                      </td>
                      <td style={{
                        color: 'var(--color-text-secondary)',
                        whiteSpace: 'normal',
                        minWidth: '140px',
                      }}>
                        {item.drug?.brand_name || '-'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{
                          fontSize: 'var(--text-lg)',
                          fontWeight: 'var(--font-medium)',
                          color: 'var(--color-text-primary)',
                          lineHeight: 1,
                        }}>
                          {formatNumber(qty)}
                        </div>
                        <div style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-tertiary)',
                          marginTop: '3px',
                        }}>
                          on hand
                        </div>
                      </td>
                      <td className="fm-table-muted" style={{ whiteSpace: 'nowrap' }}>
                        <div>{formatNumber(min)} / {formatNumber(max)}</div>
                        <div style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-tertiary)',
                          marginTop: '3px',
                        }}>
                          min / max
                        </div>
                      </td>
                      <td style={{
                        color: 'var(--color-success)',
                        fontWeight: 'var(--font-medium)',
                        whiteSpace: 'nowrap',
                      }}>
                        AED {formatMoney(value)}
                      </td>
                      <td className="fm-table-muted" style={{ whiteSpace: 'nowrap' }}>
                        {item.expiry_date || '-'}
                      </td>
                      <td style={{
                        color: 'var(--color-text-primary)',
                        fontWeight: 'var(--font-medium)',
                        whiteSpace: 'nowrap',
                      }}>
                        {item.storage_location || '-'}
                      </td>
                      <td className="fm-table-muted">
                        {item.batch_number || '-'}
                      </td>
                      <td>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-accent)',
                        }}>
                          {item.drug_code}
                        </span>
                      </td>
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

function ExplorerKpiCard({ label, value, sub, color, barColor }) {
  return (
    <div className="fm-kpi-card">
      <div className="fm-kpi-label">{label}</div>
      <div className="fm-kpi-value" style={{ color }}>{value}</div>
      {sub && (
        <div style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          marginTop: '3px',
        }}>
          {sub}
        </div>
      )}
      <div className="fm-kpi-bar">
        <div className="fm-kpi-bar-fill" style={{ width: '60%', background: barColor }} />
      </div>
    </div>
  )
}

function StockBadge({ status }) {
  const styleMap = {
    'Out of Stock': {
      color: 'var(--color-danger-mid)',
      background: 'rgba(163,45,45,0.12)',
      border: '1px solid rgba(163,45,45,0.30)',
    },
    'Low Stock': {
      color: 'var(--color-warning-mid)',
      background: 'rgba(186,117,23,0.12)',
      border: '1px solid rgba(186,117,23,0.30)',
    },
    'Healthy': {
      color: 'var(--color-success)',
      background: 'rgba(29,158,117,0.12)',
      border: '1px solid rgba(29,158,117,0.30)',
    },
  }

  const style = styleMap[status.label] ?? {
    color: 'var(--color-text-secondary)',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--color-border-default)',
  }

  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 'var(--radius-pill)',
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--font-medium)',
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {status.label}
    </span>
  )
}

function getStockStatus(item) {
  const qty = Number(item.quantity_on_hand || 0)
  const min = Number(item.minimum_stock || 0)
  if (qty === 0) return { label: 'Out of Stock' }
  if (qty <= min) return { label: 'Low Stock' }
  return { label: 'Healthy' }
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
