/**
 * FalconMed v3 — Availability Analytics Page
 * src/pages/AvailabilityAnalyticsPage.jsx
 *
 * Phase 4 — Formulary availability and stock shortage analysis.
 * Consumes: computeAvailability from src/analytics/inventoryAnalytics.js
 *
 * No new Supabase tables. No schema changes. Foundation untouched.
 */

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { computeAvailability } from '../analytics/inventoryAnalytics'

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtNum(v)  { return Number(v || 0).toLocaleString() }
function fmtPct(v)  { return `${Number(v || 0).toFixed(1)}%` }
function fmtMoney(v) {
  return Number(v || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

// ─── Colours ──────────────────────────────────────────────────────────────────
const TONE = {
  red:   { color: 'var(--color-danger-mid)',  bg: 'rgba(163,45,45,0.12)',   border: 'rgba(163,45,45,0.30)'   },
  amber: { color: 'var(--color-warning-mid)', bg: 'rgba(186,117,23,0.12)', border: 'rgba(186,117,23,0.30)' },
  green: { color: 'var(--color-success)',     bg: 'rgba(29,158,117,0.12)', border: 'rgba(29,158,117,0.30)' },
  blue:  { color: 'var(--color-primary)',     bg: 'rgba(24,95,165,0.12)',  border: 'rgba(24,95,165,0.30)'  },
}

function availTone(rate) {
  if (rate >= 85) return 'green'
  if (rate >= 70) return 'amber'
  return 'red'
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AvailabilityAnalyticsPage() {
  const [loading, setLoading]       = useState(true)
  const [inventory, setInventory]   = useState([])
  const [pharmacies, setPharmacies] = useState([])
  const [drugMaster, setDrugMaster] = useState([])

  const [activeTab,      setActiveTab]      = useState('pharmacies')
  const [filterType,     setFilterType]     = useState('ALL')
  const [searchTerm,     setSearchTerm]     = useState('')
  const [sortKey,        setSortKey]        = useState('availabilityRate')

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [invRes, pharmRes, drugRes] = await Promise.all([
      supabase.from('inventory').select(
        'id, pharmacy_id, drug_code, quantity_on_hand, ' +
        'minimum_stock, maximum_stock, unit_cost, ' +
        'expiry_date, inventory_status'
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
  const availability = useMemo(
    () => computeAvailability(inventory, pharmacies),
    [inventory, pharmacies]
  )

  // ── Drug master map for names ──────────────────────────────────────────────
  const drugMap = useMemo(
    () => new Map((drugMaster || []).map(d => [d.drug_code || d.doh_code, d])),
    [drugMaster]
  )

  // ── Pharmacy type options ──────────────────────────────────────────────────
  const typeOptions = useMemo(() => {
    const types = [...new Set(
      availability.byPharmacy.map(p => p.pharmacyType).filter(Boolean)
    )].sort()
    return types
  }, [availability.byPharmacy])

  // ── Filtered & sorted pharmacies ───────────────────────────────────────────
  const filteredPharmacies = useMemo(() => {
    let rows = availability.byPharmacy
    if (filterType !== 'ALL') rows = rows.filter(p => p.pharmacyType === filterType)
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      rows = rows.filter(p =>
        p.pharmacyName.toLowerCase().includes(q) ||
        p.pharmacyCode.toLowerCase().includes(q)
      )
    }
    return [...rows].sort((a, b) => a[sortKey] - b[sortKey])
  }, [availability.byPharmacy, filterType, searchTerm, sortKey])

  // ── Out of stock items enriched with drug names ────────────────────────────
  const outOfStockEnriched = useMemo(() => {
    const pharmMap = new Map(pharmacies.map(p => [p.id, p]))
    return availability.outOfStockItems.map(item => {
      const drug    = drugMap.get(item.drug_code) || {}
      const pharmacy = pharmMap.get(item.pharmacy_id) || {}
      return {
        ...item,
        pharmacyName: pharmacy.name || item.pharmacyName || '',
        pharmacyCode: pharmacy.code || '',
        pharmacyType: pharmacy.pharmacy_type || '',
        generic_name: (drug.generic_name || '').trim(),
        brand_name:   (drug.brand_name   || '').trim(),
        strength:     (drug.strength     || '').trim(),
        dosage_form:  (drug.dosage_form  || '').trim(),
        unit_cost:    Number(
          inventory.find(i => i.drug_code === item.drug_code && i.pharmacy_id === item.pharmacy_id)
          ?.unit_cost || 0
        ),
      }
    }).filter(item => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        return (
          item.drug_code.toLowerCase().includes(q)    ||
          item.generic_name.toLowerCase().includes(q) ||
          item.pharmacyName.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [availability.outOfStockItems, drugMap, pharmacies, inventory, searchTerm])

  if (loading) {
    return (
      <div>
        <div className="fm-page-header">
          <div className="fm-page-header-top">
            <div>
              <div className="fm-page-header-meta">Analytics</div>
              <h1 className="fm-page-header-title">Availability analytics</h1>
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

  const net = availability.network
  const netTone = availTone(net.availabilityRate)

  return (
    <div>
      {/* ═══════════════════════════════════════
          PAGE HEADER
      ═══════════════════════════════════════ */}
      <div className="fm-page-header">
        <div className="fm-page-header-top">
          <div>
            <div className="fm-page-header-meta">Analytics · Availability</div>
            <h1 className="fm-page-header-title">Availability analytics</h1>
            <p className="fm-page-header-desc">
              Formulary availability rate, out-of-stock analysis, and
              patient access risk across the pharmacy network.
            </p>
          </div>

          {/* Network availability badge */}
          <div style={{
            padding: '14px 20px', borderRadius: 'var(--radius-lg)',
            background: TONE[netTone].bg, border: `1px solid ${TONE[netTone].border}`,
            textAlign: 'right', minWidth: '180px',
          }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Network availability
            </div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 900, color: TONE[netTone].color }}>
              {fmtPct(net.availabilityRate)}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {fmtNum(net.active)} of {fmtNum(net.total)} lines available
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          SECTION 1 — KPI CARDS
      ═══════════════════════════════════════ */}
      <div className="fm-grid-kpi" style={{ marginBottom: '24px' }}>

        <KpiCard
          label="Formulary availability rate"
          value={fmtPct(net.availabilityRate)}
          sub={`${fmtNum(net.active)} lines adequately stocked`}
          context={`Target ≥ 85% — current status: ${net.availabilityRate >= 85 ? 'Meets target' : 'Below target'}`}
          tone={netTone}
        />
        <KpiCard
          label="Out of stock lines"
          value={fmtNum(net.outOfStock)}
          sub={`${fmtPct(net.total > 0 ? net.outOfStock / net.total * 100 : 0)} of formulary`}
          context="Zero-quantity items — patient cannot access these drugs"
          tone="red"
          badge="Patient access risk"
        />
        <KpiCard
          label="Low stock lines"
          value={fmtNum(net.lowStock)}
          sub={`${fmtPct(net.total > 0 ? net.lowStock / net.total * 100 : 0)} below reorder point`}
          context="Stock below minimum — at risk of running out"
          tone="amber"
          badge="Shortage risk"
        />
        <KpiCard
          label="Expired lines"
          value={fmtNum(net.expired)}
          sub={`${fmtPct(net.total > 0 ? net.expired / net.total * 100 : 0)} of formulary`}
          context="Expired items reduce effective availability"
          tone="red"
          badge="Unavailable"
        />

      </div>

      {/* ═══════════════════════════════════════
          SECTION 2 — NETWORK AVAILABILITY BAR
      ═══════════════════════════════════════ */}
      <div className="fm-card" style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)', marginBottom: '12px' }}>
          Network formulary status breakdown
        </div>
        <div style={{ display: 'flex', height: '28px', borderRadius: 'var(--radius-md)', overflow: 'hidden', gap: '2px' }}>
          {[
            { label: 'Active',      value: net.active,      color: 'var(--color-success)' },
            { label: 'Low Stock',   value: net.lowStock,    color: 'var(--color-warning-mid)' },
            { label: 'Out of Stock',value: net.outOfStock,  color: 'var(--color-danger-mid)' },
            { label: 'Expired',     value: net.expired,     color: '#555' },
          ].map(seg => {
            const pct = net.total > 0 ? (seg.value / net.total * 100) : 0
            if (pct < 0.1) return null
            return (
              <div
                key={seg.label}
                title={`${seg.label}: ${fmtNum(seg.value)} (${pct.toFixed(1)}%)`}
                style={{ width: `${pct}%`, background: seg.color, minWidth: '2px' }}
              />
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: '20px', marginTop: '10px', flexWrap: 'wrap' }}>
          {[
            { label: 'Active',      value: net.active,     color: 'var(--color-success)' },
            { label: 'Low Stock',   value: net.lowStock,   color: 'var(--color-warning-mid)' },
            { label: 'Out of Stock',value: net.outOfStock, color: 'var(--color-danger-mid)' },
            { label: 'Expired',     value: net.expired,    color: 'var(--color-text-tertiary)' },
          ].map(seg => (
            <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: seg.color }} />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                {seg.label}: <strong style={{ color: seg.color }}>{fmtNum(seg.value)}</strong>
                {' '}({net.total > 0 ? (seg.value / net.total * 100).toFixed(1) : '0.0'}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════
          SECTION 3 — TABS
      ═══════════════════════════════════════ */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '16px',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        {[
          { key: 'pharmacies', label: `By pharmacy (${fmtNum(filteredPharmacies.length)})` },
          { key: 'oos',        label: `Out of stock (${fmtNum(outOfStockEnriched.length)})` },
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

      {/* ── Shared filters ── */}
      <div style={{
        display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center',
        padding: '12px 16px', marginBottom: '14px',
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
      }}>
        <input
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Search pharmacy or drug..."
          style={{ ...selectStyle, minWidth: '200px' }}
        />
        {activeTab === 'pharmacies' && (
          <>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
              <option value="ALL">All types</option>
              {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={selectStyle}>
              <option value="availabilityRate">Sort: Availability Rate ↑</option>
              <option value="outOfStockRate">Sort: Out of Stock Rate ↓</option>
              <option value="outOfStock">Sort: OOS Count ↓</option>
            </select>
          </>
        )}
        {(filterType !== 'ALL' || searchTerm) && (
          <button className="fm-btn" onClick={() => { setFilterType('ALL'); setSearchTerm('') }}>
            Reset
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          {activeTab === 'pharmacies' ? fmtNum(filteredPharmacies.length) : fmtNum(outOfStockEnriched.length)} records
        </span>
      </div>

      {/* ═══════════════════════════════════════
          TAB 1 — BY PHARMACY
      ═══════════════════════════════════════ */}
      {activeTab === 'pharmacies' && (
        <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="fm-table" style={{ minWidth: '900px' }}>
              <thead>
                <tr>
                  <th>Pharmacy</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Total Lines</th>
                  <th style={{ textAlign: 'right' }}>Available</th>
                  <th style={{ textAlign: 'right' }}>Out of Stock</th>
                  <th style={{ textAlign: 'right' }}>Low Stock</th>
                  <th style={{ textAlign: 'right' }}>Expired</th>
                  <th style={{ textAlign: 'right' }}>Availability Rate</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPharmacies.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-tertiary)' }}>
                      No pharmacies match the current filters.
                    </td>
                  </tr>
                ) : filteredPharmacies.map(p => {
                  const tone = availTone(p.availabilityRate)
                  const t    = TONE[tone]
                  return (
                    <tr key={p.pharmacyId}>
                      <td>
                        <div style={{ fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
                          {p.pharmacyName}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                          {p.pharmacyCode}
                        </div>
                      </td>
                      <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        {p.pharmacyType || '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                        {fmtNum(p.total)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--color-success)', fontSize: 'var(--text-sm)' }}>
                        {fmtNum(p.active)}
                      </td>
                      <td style={{ textAlign: 'right', color: p.outOfStock > 0 ? 'var(--color-danger-mid)' : 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        {p.outOfStock > 0 ? fmtNum(p.outOfStock) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: p.lowStock > 0 ? 'var(--color-warning-mid)' : 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        {p.lowStock > 0 ? fmtNum(p.lowStock) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: p.expired > 0 ? 'var(--color-danger-mid)' : 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        {p.expired > 0 ? fmtNum(p.expired) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                          <div style={{ width: '60px', height: '6px', background: 'var(--color-bg-content)', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ width: `${p.availabilityRate}%`, height: '100%', background: t.color, borderRadius: '999px' }} />
                          </div>
                          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: t.color, minWidth: '44px', textAlign: 'right' }}>
                            {fmtPct(p.availabilityRate)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 'var(--text-xs)', padding: '3px 8px',
                          borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
                          color: t.color, background: t.bg, border: `1px solid ${t.border}`,
                        }}>
                          {p.availabilityRate >= 85 ? 'Adequate'
                         : p.availabilityRate >= 70 ? 'Watch'
                         : 'Critical'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          <div style={{
            padding: '10px 16px', borderTop: '1px solid var(--color-border-subtle)',
            display: 'flex', gap: '24px', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', flexWrap: 'wrap',
          }}>
            <span>Adequate (≥85%): <strong style={{ color: 'var(--color-success)' }}>
              {fmtNum(availability.byPharmacy.filter(p => p.availabilityRate >= 85).length)} pharmacies
            </strong></span>
            <span>Watch (70–84%): <strong style={{ color: 'var(--color-warning-mid)' }}>
              {fmtNum(availability.byPharmacy.filter(p => p.availabilityRate >= 70 && p.availabilityRate < 85).length)} pharmacies
            </strong></span>
            <span>Critical (&lt;70%): <strong style={{ color: 'var(--color-danger-mid)' }}>
              {fmtNum(availability.byPharmacy.filter(p => p.availabilityRate < 70).length)} pharmacies
            </strong></span>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB 2 — OUT OF STOCK ITEMS
      ═══════════════════════════════════════ */}
      {activeTab === 'oos' && (
        <div>
          {/* OOS summary banner */}
          <div style={{
            padding: '14px 20px', marginBottom: '14px',
            background: TONE.red.bg, border: `1px solid ${TONE.red.border}`,
            borderRadius: 'var(--radius-lg)',
            display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Total out of stock
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 900, color: TONE.red.color }}>
                {fmtNum(net.outOfStock)} lines
              </div>
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', maxWidth: '500px' }}>
              These drug lines have zero quantity on hand. Patients prescribed these
              medications cannot receive them from the current pharmacy without a transfer
              or emergency procurement. Each line represents a potential patient access failure.
            </div>
          </div>

          <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table" style={{ minWidth: '800px' }}>
                <thead>
                  <tr>
                    <th>Drug</th>
                    <th>Pharmacy</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Min Stock</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {outOfStockEnriched.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-tertiary)' }}>
                        No out-of-stock items match the current search.
                      </td>
                    </tr>
                  ) : outOfStockEnriched.slice(0, 500).map((item, idx) => (
                    <tr key={idx}>
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
                      <td>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                          {item.pharmacyName}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                          {item.pharmacyCode}
                        </div>
                      </td>
                      <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        {item.pharmacyType || '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                        {item.minimum_stock > 0 ? fmtNum(item.minimum_stock) : '—'}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 'var(--text-xs)', padding: '3px 8px',
                          borderRadius: 'var(--radius-pill)',
                          color: TONE.red.color, background: TONE.red.bg, border: `1px solid ${TONE.red.border}`,
                        }}>
                          Out of stock
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {outOfStockEnriched.length > 500 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border-subtle)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                Showing first 500 of {fmtNum(outOfStockEnriched.length)} out-of-stock lines.
              </div>
            )}
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

// ─── Styles ───────────────────────────────────────────────────────────────────
const selectStyle = {
  padding: '7px 10px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-default)',
  background: 'var(--color-bg-input)', color: 'var(--color-text-primary)',
  fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)',
}
