/**
 * FalconMed v3 — Financial Analytics Page
 * src/pages/FinancialAnalyticsPage.jsx
 *
 * Phase 3 — ABC Classification and Financial Risk Analysis.
 * Consumes: computeABC, computeFinancialRisk, computeOverstock
 * from src/analytics/inventoryAnalytics.js
 *
 * No new Supabase tables. No schema changes. Foundation untouched.
 */

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  computeABC,
  computeFinancialRisk,
  computeOverstock,
} from '../analytics/inventoryAnalytics'

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtMoney(v) {
  return Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}
function fmtMoneyCompact(v) {
  return Intl.NumberFormat(undefined, {
    notation: 'compact', maximumFractionDigits: 1,
  }).format(Number(v || 0))
}
function fmtNum(v) { return Number(v || 0).toLocaleString() }
function fmtPct(v) { return `${Number(v || 0).toFixed(1)}%` }

// ─── Colours ──────────────────────────────────────────────────────────────────
const TONE = {
  red:   { color: 'var(--color-danger-mid)',  bg: 'rgba(163,45,45,0.12)',   border: 'rgba(163,45,45,0.30)'   },
  amber: { color: 'var(--color-warning-mid)', bg: 'rgba(186,117,23,0.12)', border: 'rgba(186,117,23,0.30)' },
  green: { color: 'var(--color-success)',     bg: 'rgba(29,158,117,0.12)', border: 'rgba(29,158,117,0.30)' },
  blue:  { color: 'var(--color-primary)',     bg: 'rgba(24,95,165,0.12)',  border: 'rgba(24,95,165,0.30)'  },
}

const ABC_TONE   = { A: 'green', B: 'blue', C: 'amber' }
const ABC_DESC   = {
  A: 'Top 80% of value — highest priority control',
  B: 'Next 15% of value — regular monitoring',
  C: 'Bottom 5% of value — low-priority items',
}

// ─────────────────────────────────────────────────────────────────────────────
export default function FinancialAnalyticsPage() {
  const [loading, setLoading]       = useState(true)
  const [inventory, setInventory]   = useState([])
  const [pharmacies, setPharmacies] = useState([])
  const [drugMaster, setDrugMaster] = useState([])

  // Filters & tabs
  const [activeTab,     setActiveTab]     = useState('abc')
  const [filterClass,   setFilterClass]   = useState('ALL')
  const [filterPharmacy,setFilterPharmacy]= useState('ALL')
  const [searchTerm,    setSearchTerm]    = useState('')

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [invRes, pharmRes, drugRes] = await Promise.all([
      supabase.from('inventory').select(
        'id, pharmacy_id, drug_code, quantity_on_hand, unit_cost, ' +
        'minimum_stock, maximum_stock, expiry_date, inventory_status'
      ),
      supabase.from('pharmacies').select('id, name, code, pharmacy_type'),
      supabase.from('drug_master_reference').select(
        'drug_code, doh_code, generic_name, brand_name, strength, dosage_form'
      ),
    ])
    setInventory(invRes.data   || [])
    setPharmacies(pharmRes.data || [])
    setDrugMaster(drugRes.data  || [])
    setLoading(false)
  }

  // ── Analytics ──────────────────────────────────────────────────────────────
  const abcData       = useMemo(() => computeABC(inventory, drugMaster),       [inventory, drugMaster])
  const financialRisk = useMemo(() => computeFinancialRisk(inventory),         [inventory])
  const overstockData = useMemo(() => computeOverstock(inventory, pharmacies), [inventory, pharmacies])

  // ── ABC summary by class ───────────────────────────────────────────────────
  const abcSummary = useMemo(() => {
    const map = { A: { count:0, value:0 }, B: { count:0, value:0 }, C: { count:0, value:0 } }
    for (const item of abcData) {
      map[item.abcClass].count++
      map[item.abcClass].value += item.lineValue
    }
    return map
  }, [abcData])

  // ── Filter options ─────────────────────────────────────────────────────────
  const pharmacyOptions = useMemo(() => {
    const m = new Map(pharmacies.map(p => [p.id, p.name]))
    const names = [...new Set(abcData.map(i => m.get(i.pharmacy_id) || '').filter(Boolean))].sort()
    return names
  }, [abcData, pharmacies])

  // ── Filtered ABC items ─────────────────────────────────────────────────────
  const pharmacyNameMap = useMemo(() =>
    new Map(pharmacies.map(p => [p.id, p.name])),
    [pharmacies]
  )

  const filteredABC = useMemo(() => {
    return abcData.filter(item => {
      const pharmName = pharmacyNameMap.get(item.pharmacy_id) || ''
      if (filterClass   !== 'ALL' && item.abcClass !== filterClass)     return false
      if (filterPharmacy !== 'ALL' && pharmName !== filterPharmacy)     return false
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        const matches =
          item.drug_code.toLowerCase().includes(q)   ||
          item.generic_name.toLowerCase().includes(q) ||
          item.brand_name.toLowerCase().includes(q)
        if (!matches) return false
      }
      return true
    }).map(item => ({
      ...item,
      pharmacyName: pharmacyNameMap.get(item.pharmacy_id) || '',
    }))
  }, [abcData, filterClass, filterPharmacy, searchTerm, pharmacyNameMap])

  if (loading) {
    return (
      <div>
        <div className="fm-page-header">
          <div className="fm-page-header-top">
            <div>
              <div className="fm-page-header-meta">Analytics</div>
              <h1 className="fm-page-header-title">Financial analytics</h1>
            </div>
          </div>
        </div>
        <div className="fm-grid-kpi">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="fm-kpi-card" style={{ opacity: 0.35 }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* ═══════════════════════════════════════
          PAGE HEADER
      ═══════════════════════════════════════ */}
      <div className="fm-page-header">
        <div className="fm-page-header-top">
          <div>
            <div className="fm-page-header-meta">Analytics · Financial</div>
            <h1 className="fm-page-header-title">Financial analytics</h1>
            <p className="fm-page-header-desc">
              ABC classification, value concentration, overstock exposure,
              and financial risk profile across the pharmacy network.
            </p>
          </div>
          {/* Financial Risk Index */}
          <div style={{
            padding: '14px 20px', borderRadius: 'var(--radius-lg)', textAlign: 'right',
            background: financialRisk.riskTier === 'HIGH' ? TONE.red.bg
                      : financialRisk.riskTier === 'MEDIUM' ? TONE.amber.bg : TONE.green.bg,
            border: `1px solid ${financialRisk.riskTier === 'HIGH' ? TONE.red.border
                      : financialRisk.riskTier === 'MEDIUM' ? TONE.amber.border : TONE.green.border}`,
            minWidth: '180px',
          }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Financial risk index
            </div>
            <div style={{
              fontSize: 'var(--text-2xl)', fontWeight: 900,
              color: financialRisk.riskTier === 'HIGH' ? TONE.red.color
                   : financialRisk.riskTier === 'MEDIUM' ? TONE.amber.color : TONE.green.color,
            }}>
              {fmtPct(financialRisk.financialRiskIndex)}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {financialRisk.riskTier} risk · AED {fmtMoneyCompact(financialRisk.totalAtRiskValue)} at risk
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          SECTION 1 — FINANCIAL KPI CARDS
      ═══════════════════════════════════════ */}
      <div className="fm-grid-kpi" style={{ marginBottom: '24px' }}>

        <KpiCard
          label="Total inventory value"
          value={`AED ${fmtMoneyCompact(financialRisk.totalValue)}`}
          sub={`AED ${fmtMoney(financialRisk.totalValue)}`}
          context={`${fmtNum(abcData.length)} valued inventory lines`}
          tone="green"
        />
        <KpiCard
          label="Carrying cost (monthly est.)"
          value={`AED ${fmtMoneyCompact(financialRisk.carryingCostMonthly)}`}
          sub={`AED ${fmtMoney(financialRisk.carryingCostMonthly)}`}
          context="Based on 27% annual holding rate — industry standard"
          tone="blue"
        />
        <KpiCard
          label="Overstock value"
          value={`AED ${fmtMoneyCompact(overstockData.totalExcessValue)}`}
          sub={`AED ${fmtMoney(overstockData.totalExcessValue)}`}
          context={`${fmtNum(overstockData.items.length)} items exceed maximum stock level`}
          tone="amber"
          badge="Capital locked"
        />
        <KpiCard
          label="Value recovery potential"
          value={`AED ${fmtMoneyCompact(financialRisk.valueRecoveryPotential)}`}
          sub={`AED ${fmtMoney(financialRisk.valueRecoveryPotential)}`}
          context="Est. 60% of critical + near-expiry value is recoverable"
          tone="green"
          badge="Recoverable"
        />

      </div>

      {/* ═══════════════════════════════════════
          SECTION 2 — ABC SUMMARY STRIP
      ═══════════════════════════════════════ */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px', marginBottom: '20px',
      }}>
        {(['A','B','C']).map(cls => {
          const t    = TONE[ABC_TONE[cls]]
          const data = abcSummary[cls]
          const pct  = financialRisk.totalValue > 0
            ? (data.value / financialRisk.totalValue * 100).toFixed(1)
            : '0.0'
          return (
            <div
              key={cls}
              onClick={() => setFilterClass(filterClass === cls ? 'ALL' : cls)}
              style={{
                padding: '16px 20px',
                background: filterClass === cls ? t.bg : 'var(--color-bg-card)',
                border: `1px solid ${filterClass === cls ? t.border : 'var(--color-border-default)'}`,
                borderRadius: 'var(--radius-lg)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{
                  fontSize: '28px', fontWeight: 900, color: t.color,
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: t.bg, border: `2px solid ${t.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {cls}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 'var(--text-lg)', fontWeight: 900, color: t.color }}>
                    {pct}%
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                    of total value
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)', marginBottom: '2px' }}>
                AED {fmtMoneyCompact(data.value)} · {fmtNum(data.count)} lines
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                {ABC_DESC[cls]}
              </div>
              {/* Bar */}
              <div style={{ height: '4px', background: 'var(--color-bg-content)', borderRadius: '999px', marginTop: '12px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: t.color, borderRadius: '999px' }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* ═══════════════════════════════════════
          SECTION 3 — TABS
      ═══════════════════════════════════════ */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '16px',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        {[
          { key: 'abc',       label: `ABC classification (${fmtNum(filteredABC.length)})` },
          { key: 'overstock', label: `Overstock (${fmtNum(overstockData.items.length)})` },
          { key: 'risk',      label: 'Financial risk profile' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 16px', fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-sans)', border: 'none',
              borderBottom: activeTab === tab.key
                ? '2px solid var(--color-primary)' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontWeight: activeTab === tab.key ? 'var(--font-medium)' : 'normal',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════
          TAB 1 — ABC CLASSIFICATION TABLE
      ═══════════════════════════════════════ */}
      {activeTab === 'abc' && (
        <div>
          {/* Filters */}
          <div style={{
            display: 'flex', gap: '10px', flexWrap: 'wrap',
            padding: '12px 16px', marginBottom: '14px',
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-lg)', alignItems: 'center',
          }}>
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search drug name or code..."
              style={{ ...selectStyle, minWidth: '220px' }}
            />
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)} style={selectStyle}>
              <option value="ALL">All classes</option>
              <option value="A">Class A — Top 80%</option>
              <option value="B">Class B — 80–95%</option>
              <option value="C">Class C — Bottom 5%</option>
            </select>
            <select value={filterPharmacy} onChange={e => setFilterPharmacy(e.target.value)} style={selectStyle}>
              <option value="ALL">All pharmacies</option>
              {pharmacyOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {(filterClass !== 'ALL' || filterPharmacy !== 'ALL' || searchTerm) && (
              <button className="fm-btn" onClick={() => {
                setFilterClass('ALL'); setFilterPharmacy('ALL'); setSearchTerm('')
              }}>Reset</button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {fmtNum(filteredABC.length)} records
            </span>
          </div>

          <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table" style={{ minWidth: '900px' }}>
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Drug</th>
                    <th>Pharmacy</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ textAlign: 'right' }}>Line Value</th>
                    <th style={{ textAlign: 'right' }}>% of Total</th>
                    <th style={{ textAlign: 'right' }}>Cumulative %</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredABC.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-tertiary)' }}>
                        No records match the current filters.
                      </td>
                    </tr>
                  ) : filteredABC.map(item => {
                    const t = TONE[ABC_TONE[item.abcClass]]
                    return (
                      <tr key={item.id}>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: '28px', height: '28px', borderRadius: '50%',
                            fontSize: 'var(--text-sm)', fontWeight: 900,
                            color: t.color, background: t.bg, border: `1px solid ${t.border}`,
                          }}>
                            {item.abcClass}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
                            {item.generic_name || item.drug_code}
                          </div>
                          {item.brand_name && (
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                              {item.brand_name}{item.strength ? ` · ${item.strength}` : ''}
                            </div>
                          )}
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                            {item.drug_code}
                          </div>
                        </td>
                        <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                          {item.pharmacyName || '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                          {fmtNum(item.quantity_on_hand)}
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                          {item.unit_cost > 0 ? `AED ${fmtMoney(item.unit_cost)}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)', color: t.color }}>
                          AED {fmtMoney(item.lineValue)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                            <div style={{
                              width: '40px', height: '4px',
                              background: 'var(--color-bg-content)',
                              borderRadius: '999px', overflow: 'hidden',
                            }}>
                              <div style={{
                                width: `${Math.min(100, item.valuePct * 10)}%`,
                                height: '100%', background: t.color, borderRadius: '999px',
                              }} />
                            </div>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', minWidth: '38px', textAlign: 'right' }}>
                              {fmtPct(item.valuePct)}
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                          {fmtPct(item.cumulativePct)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filteredABC.length > 0 && (
              <div style={{
                padding: '10px 16px', borderTop: '1px solid var(--color-border-subtle)',
                display: 'flex', gap: '24px', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)',
              }}>
                <span>Filtered value: <strong style={{ color: 'var(--color-success)' }}>
                  AED {fmtMoney(filteredABC.reduce((s, i) => s + i.lineValue, 0))}
                </strong></span>
                <span>Records: <strong style={{ color: 'var(--color-text-primary)' }}>{fmtNum(filteredABC.length)}</strong></span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB 2 — OVERSTOCK TABLE
      ═══════════════════════════════════════ */}
      {activeTab === 'overstock' && (
        <div>
          {overstockData.items.length === 0 ? (
            <div className="fm-card" style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-tertiary)' }}>
              No overstock detected — all items are within maximum stock levels.
            </div>
          ) : (
            <>
              {/* Overstock summary */}
              <div style={{
                padding: '14px 20px', marginBottom: '14px',
                background: TONE.amber.bg, border: `1px solid ${TONE.amber.border}`,
                borderRadius: 'var(--radius-lg)',
                display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Total excess value
                  </div>
                  <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 900, color: TONE.amber.color }}>
                    AED {fmtMoney(overstockData.totalExcessValue)}
                  </div>
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', maxWidth: '400px' }}>
                  These items exceed their maximum stock level. The excess quantity represents
                  capital tied up unnecessarily and increases the risk of expiry before consumption.
                </div>
              </div>

              <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="fm-table" style={{ minWidth: '850px' }}>
                    <thead>
                      <tr>
                        <th>Drug</th>
                        <th>Pharmacy</th>
                        <th style={{ textAlign: 'right' }}>Current Qty</th>
                        <th style={{ textAlign: 'right' }}>Max Stock</th>
                        <th style={{ textAlign: 'right' }}>Excess Qty</th>
                        <th style={{ textAlign: 'right' }}>Unit Cost</th>
                        <th style={{ textAlign: 'right' }}>Excess Value</th>
                        <th>Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overstockData.items.map(item => (
                        <tr key={item.id}>
                          <td>
                            <div style={{ fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
                              {item.drug_code}
                            </div>
                          </td>
                          <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                            {item.pharmacyName}
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{item.pharmacyCode}</div>
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                            {fmtNum(item.quantity_on_hand)}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                            {fmtNum(item.maximum_stock)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)', color: TONE.amber.color }}>
                            +{fmtNum(item.excessQuantity)}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                            AED {fmtMoney(item.unit_cost)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)', color: TONE.amber.color }}>
                            AED {fmtMoney(item.excessValue)}
                          </td>
                          <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                            {item.expiry_date || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB 3 — FINANCIAL RISK PROFILE
      ═══════════════════════════════════════ */}
      {activeTab === 'risk' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap: '16px' }}>

          {/* Value breakdown */}
          <div className="fm-card">
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)', marginBottom: '16px' }}>
              Value breakdown
            </div>
            {[
              { label: 'Total inventory value',   value: financialRisk.totalValue,       color: 'var(--color-success)' },
              { label: 'Healthy stock value',      value: financialRisk.totalValue - financialRisk.totalAtRiskValue - overstockData.totalExcessValue, color: 'var(--color-success)' },
              { label: 'Near expiry value',        value: financialRisk.nearExpiryValue,  color: 'var(--color-warning-mid)' },
              { label: 'Critical expiry value',    value: financialRisk.criticalValue,    color: 'var(--color-danger-mid)' },
              { label: 'Expired value',            value: financialRisk.expiredValue,     color: 'var(--color-danger-mid)' },
              { label: 'Overstock excess value',   value: overstockData.totalExcessValue, color: TONE.amber.color },
            ].map(row => (
              <div key={row.label} style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '10px 0', borderBottom: '1px solid var(--color-border-subtle)',
              }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{row.label}</span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: row.color }}>
                  AED {fmtMoney(row.value)}
                </span>
              </div>
            ))}
          </div>

          {/* Risk metrics */}
          <div className="fm-card">
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)', marginBottom: '16px' }}>
              Risk metrics
            </div>
            {[
              { label: 'Financial Risk Index',        value: fmtPct(financialRisk.financialRiskIndex), note: financialRisk.riskTier },
              { label: 'Preventable loss (90d)',       value: `AED ${fmtMoney(financialRisk.preventableLoss)}`,   note: 'Can still be saved' },
              { label: 'Confirmed loss (expired)',     value: `AED ${fmtMoney(financialRisk.confirmedLoss)}`,     note: 'Write-off required' },
              { label: 'Value recovery potential',     value: `AED ${fmtMoney(financialRisk.valueRecoveryPotential)}`, note: '60% of preventable' },
              { label: 'Monthly carrying cost (est.)', value: `AED ${fmtMoney(financialRisk.carryingCostMonthly)}`, note: '27% annual rate' },
              { label: 'Out-of-stock lines',           value: fmtNum(financialRisk.outOfStockCount),             note: 'Zero-value inventory' },
            ].map(row => (
              <div key={row.label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                padding: '10px 0', borderBottom: '1px solid var(--color-border-subtle)',
              }}>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{row.label}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{row.note}</div>
                </div>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* ABC value summary */}
          <div className="fm-card">
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)', marginBottom: '16px' }}>
              ABC value concentration
            </div>
            {(['A','B','C']).map(cls => {
              const t    = TONE[ABC_TONE[cls]]
              const data = abcSummary[cls]
              const pct  = financialRisk.totalValue > 0
                ? (data.value / financialRisk.totalValue * 100).toFixed(1) : '0.0'
              return (
                <div key={cls} style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '22px', height: '22px', borderRadius: '50%',
                        fontSize: 'var(--text-xs)', fontWeight: 900,
                        color: t.color, background: t.bg, border: `1px solid ${t.border}`,
                      }}>{cls}</span>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                        {fmtNum(data.count)} lines
                      </span>
                    </div>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: t.color }}>
                      AED {fmtMoneyCompact(data.value)} ({pct}%)
                    </span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--color-bg-content)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: t.color, borderRadius: '999px' }} />
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      )}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, context, tone, badge }) {
  const t = TONE[tone] || TONE.blue
  return (
    <div className="fm-kpi-card" style={{ borderColor: t.border, boxShadow: `0 0 0 1px ${t.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div className="fm-kpi-label">{label}</div>
        {badge && (
          <span style={{
            fontSize: '9px', padding: '2px 7px', borderRadius: 'var(--radius-pill)',
            color: t.color, background: t.bg, border: `1px solid ${t.border}`,
            fontWeight: 'var(--font-medium)', whiteSpace: 'nowrap',
          }}>{badge}</span>
        )}
      </div>
      <div className="fm-kpi-value" style={{ color: t.color }}>{value}</div>
      {sub && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>{sub}</div>}
      {context && (
        <div style={{
          fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)',
          marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--color-border-subtle)',
        }}>{context}</div>
      )}
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const selectStyle = {
  padding: '7px 10px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-default)',
  background: 'var(--color-bg-input)', color: 'var(--color-text-primary)',
  fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)',
}
