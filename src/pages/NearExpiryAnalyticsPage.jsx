/**
 * FalconMed v3 — Near Expiry Analytics Page
 * src/pages/NearExpiryAnalyticsPage.jsx
 *
 * Phase 2 — First analytical drill-down page.
 * Consumes: computeNearExpiryRisk, computeRedistribution, computeFinancialRisk
 * from src/analytics/inventoryAnalytics.js
 *
 * Data loaded once from Supabase (same queries as Dashboard — no new views).
 * All analytics computed client-side via the shared engine.
 */

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  computeNearExpiryRisk,
  computeRedistribution,
  computeFinancialRisk,
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

// ─── Tone colours (mirrors tokens.css) ───────────────────────────────────────
const TONE = {
  red:    { color: 'var(--color-danger-mid)',  bg: 'rgba(163,45,45,0.12)',   border: 'rgba(163,45,45,0.30)'   },
  amber:  { color: 'var(--color-warning-mid)', bg: 'rgba(186,117,23,0.12)', border: 'rgba(186,117,23,0.30)' },
  green:  { color: 'var(--color-success)',     bg: 'rgba(29,158,117,0.12)', border: 'rgba(29,158,117,0.30)' },
  blue:   { color: 'var(--color-primary)',     bg: 'rgba(24,95,165,0.12)',  border: 'rgba(24,95,165,0.30)'  },
}

const BUCKET_TONE = {
  EXPIRED:     'red',
  CRITICAL:    'red',
  NEAR_EXPIRY: 'amber',
}

const BUCKET_LABEL = {
  EXPIRED:     'Expired',
  CRITICAL:    'Critical — ≤29 days',
  NEAR_EXPIRY: 'Near Expiry — 30–90 days',
}

// ─────────────────────────────────────────────────────────────────────────────
export default function NearExpiryAnalyticsPage() {
  const [loading, setLoading]         = useState(true)
  const [inventory, setInventory]     = useState([])
  const [pharmacies, setPharmacies]   = useState([])
  const [drugMaster, setDrugMaster]   = useState([])

  // Filters
  const [filterBucket,   setFilterBucket]   = useState('ALL')
  const [filterPharmacy, setFilterPharmacy] = useState('ALL')
  const [filterClass,    setFilterClass]    = useState('ALL')
  const [activeTab,      setActiveTab]      = useState('items') // items | pharmacies | classes | redistribution

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)

    const [invRes, pharmRes, drugRes] = await Promise.all([
      supabase.from('inventory').select(
        'id, pharmacy_id, drug_code, quantity_on_hand, minimum_stock, ' +
        'maximum_stock, unit_cost, expiry_date, received_date, ' +
        'inventory_status, storage_location, batch_number'
      ),
      supabase.from('pharmacies').select('id, name, code, pharmacy_type'),
      supabase.from('drug_master_reference').select(
        'drug_code, doh_code, generic_name, brand_name, strength, ' +
        'dosage_form, therapeutic_class'
      ),
    ])

    setInventory(invRes.data  || [])
    setPharmacies(pharmRes.data || [])
    setDrugMaster(drugRes.data  || [])
    setLoading(false)
  }

  // ── Run analytics engine ───────────────────────────────────────────────────
  const risk = useMemo(
    () => computeNearExpiryRisk(inventory, pharmacies, drugMaster),
    [inventory, pharmacies, drugMaster]
  )

  const redistribution = useMemo(
    () => computeRedistribution(inventory, pharmacies),
    [inventory, pharmacies]
  )

  const financialRisk = useMemo(
    () => computeFinancialRisk(inventory),
    [inventory]
  )

  // ── Derived filter options ─────────────────────────────────────────────────
  const pharmacyOptions = useMemo(() => {
    const names = [...new Set(risk.items.map(i => i.pharmacyName))].sort()
    return names
  }, [risk.items])

  const classOptions = useMemo(() => {
    const classes = [...new Set(risk.items.map(i => i.therapeutic_class))].sort()
    return classes
  }, [risk.items])

  // ── Filtered items ─────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    return risk.items.filter(item => {
      if (filterBucket   !== 'ALL' && item.bucket         !== filterBucket)   return false
      if (filterPharmacy !== 'ALL' && item.pharmacyName   !== filterPharmacy) return false
      if (filterClass    !== 'ALL' && item.therapeutic_class !== filterClass)  return false
      return true
    })
  }, [risk.items, filterBucket, filterPharmacy, filterClass])

  // ── Total recoverable from redistribution ──────────────────────────────────
  const totalRecoverable = useMemo(
    () => redistribution.reduce((s, r) => s + r.valueRecoverable, 0),
    [redistribution]
  )

  if (loading) {
    return (
      <div>
        <div className="fm-page-header">
          <div className="fm-page-header-top">
            <div>
              <div className="fm-page-header-meta">Analytics</div>
              <h1 className="fm-page-header-title">Near expiry risk analysis</h1>
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
      {/* ═══════════════════════════════════════════════════════
          PAGE HEADER
      ═══════════════════════════════════════════════════════ */}
      <div className="fm-page-header">
        <div className="fm-page-header-top">
          <div>
            <div className="fm-page-header-meta">Analytics · Near Expiry</div>
            <h1 className="fm-page-header-title">Near expiry risk analysis</h1>
            <p className="fm-page-header-desc">
              Drug-level expiry risk with financial exposure, pharmacy ranking,
              therapeutic class breakdown, and redistribution opportunities.
            </p>
          </div>

          {/* Financial Risk Index badge */}
          <div style={{
            padding: '14px 20px', borderRadius: 'var(--radius-lg)',
            background: financialRisk.riskTier === 'HIGH' ? TONE.red.bg : TONE.amber.bg,
            border: `1px solid ${financialRisk.riskTier === 'HIGH' ? TONE.red.border : TONE.amber.border}`,
            textAlign: 'right', minWidth: '160px',
          }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Financial risk index
            </div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 900, color: financialRisk.riskTier === 'HIGH' ? TONE.red.color : TONE.amber.color }}>
              {financialRisk.financialRiskIndex}%
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {financialRisk.riskTier} risk
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          SECTION 1 — SUMMARY KPI CARDS
      ═══════════════════════════════════════════════════════ */}
      <div className="fm-grid-kpi" style={{ marginBottom: '24px' }}>

        <KpiCard
          label="Expired — confirmed loss"
          value={`AED ${fmtMoneyCompact(risk.summary.expiredValue)}`}
          sub={`AED ${fmtMoney(risk.summary.expiredValue)}`}
          context={`${fmtNum(risk.summary.expiredCount)} lines — write-off required`}
          tone="red"
          badge="Loss confirmed"
        />
        <KpiCard
          label="Critical — act this week"
          value={`AED ${fmtMoneyCompact(risk.summary.criticalValue)}`}
          sub={`AED ${fmtMoney(risk.summary.criticalValue)}`}
          context={`${fmtNum(risk.summary.criticalCount)} lines expiring within 29 days`}
          tone="red"
          badge="Urgent"
        />
        <KpiCard
          label="Near expiry — value at risk"
          value={`AED ${fmtMoneyCompact(risk.summary.nearExpiryValue)}`}
          sub={`AED ${fmtMoney(risk.summary.nearExpiryValue)}`}
          context={`${fmtNum(risk.summary.nearExpiryCount)} lines expiring in 30–90 days`}
          tone="amber"
          badge="Preventable"
        />
        <KpiCard
          label="Redistribution potential"
          value={`AED ${fmtMoneyCompact(totalRecoverable)}`}
          sub={`AED ${fmtMoney(totalRecoverable)}`}
          context={`${fmtNum(redistribution.length)} transfer opportunities identified`}
          tone="green"
          badge="Recoverable"
        />

      </div>

      {/* ═══════════════════════════════════════════════════════
          SECTION 2 — FILTERS
      ═══════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', gap: '12px', flexWrap: 'wrap',
        padding: '14px 18px', marginBottom: '20px',
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '4px' }}>
          Filter
        </span>

        {/* Bucket filter */}
        <select value={filterBucket} onChange={e => setFilterBucket(e.target.value)} style={selectStyle}>
          <option value="ALL">All scenarios</option>
          <option value="EXPIRED">Expired</option>
          <option value="CRITICAL">Critical (0–29d)</option>
          <option value="NEAR_EXPIRY">Near Expiry (30–90d)</option>
        </select>

        {/* Pharmacy filter */}
        <select value={filterPharmacy} onChange={e => setFilterPharmacy(e.target.value)} style={selectStyle}>
          <option value="ALL">All pharmacies</option>
          {pharmacyOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        {/* Therapeutic class filter */}
        <select value={filterClass} onChange={e => setFilterClass(e.target.value)} style={selectStyle}>
          <option value="ALL">All therapeutic classes</option>
          {classOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Reset */}
        {(filterBucket !== 'ALL' || filterPharmacy !== 'ALL' || filterClass !== 'ALL') && (
          <button className="fm-btn" onClick={() => {
            setFilterBucket('ALL')
            setFilterPharmacy('ALL')
            setFilterClass('ALL')
          }}>
            Reset filters
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
          {fmtNum(filteredItems.length)} records
        </span>
      </div>

      {/* ═══════════════════════════════════════════════════════
          SECTION 3 — TAB NAVIGATION
      ═══════════════════════════════════════════════════════ */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        paddingBottom: '0',
      }}>
        {[
          { key: 'items',          label: `Drug list (${fmtNum(filteredItems.length)})` },
          { key: 'pharmacies',     label: `By pharmacy (${fmtNum(risk.byPharmacy.length)})` },
          { key: 'classes',        label: `By therapeutic class (${fmtNum(risk.byClass.length)})` },
          { key: 'redistribution', label: `Redistribution (${fmtNum(redistribution.length)})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 16px',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-sans)',
              border: 'none',
              borderBottom: activeTab === tab.key
                ? '2px solid var(--color-primary)'
                : '2px solid transparent',
              background: 'transparent',
              color: activeTab === tab.key
                ? 'var(--color-primary)'
                : 'var(--color-text-secondary)',
              cursor: 'pointer',
              fontWeight: activeTab === tab.key ? 'var(--font-medium)' : 'normal',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════
          TAB 1 — DRUG-LEVEL LIST
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'items' && (
        <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="fm-table" style={{ minWidth: '1000px' }}>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Drug</th>
                  <th>Pharmacy</th>
                  <th>Therapeutic Class</th>
                  <th style={{ textAlign: 'right' }}>Days Left</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Value at Risk</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-tertiary)' }}>
                      No records match the current filters.
                    </td>
                  </tr>
                ) : filteredItems.map(item => {
                  const t = TONE[BUCKET_TONE[item.bucket]] || TONE.amber
                  return (
                    <tr key={item.id}>
                      <td>
                        <span style={{
                          fontSize: 'var(--text-xs)', padding: '3px 8px',
                          borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
                          color: t.color, background: t.bg, border: `1px solid ${t.border}`,
                        }}>
                          {BUCKET_LABEL[item.bucket]}
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
                      <td>
                        <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                          {item.pharmacyName}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                          {item.pharmacyCode}
                        </div>
                      </td>
                      <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                        {item.therapeutic_class || '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{
                          fontWeight: 'var(--font-medium)',
                          color: item.daysRemaining < 0 ? TONE.red.color
                               : item.daysRemaining <= 29 ? TONE.red.color
                               : TONE.amber.color,
                        }}>
                          {item.daysRemaining < 0
                            ? `${Math.abs(item.daysRemaining)}d ago`
                            : `${item.daysRemaining}d`}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                        {fmtNum(item.quantity_on_hand)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                        {item.unit_cost > 0 ? `AED ${fmtMoney(item.unit_cost)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{
                          fontWeight: 'var(--font-medium)',
                          color: item.lineValue > 10000 ? TONE.red.color
                               : item.lineValue > 1000  ? TONE.amber.color
                               : 'var(--color-text-secondary)',
                        }}>
                          AED {fmtMoney(item.lineValue)}
                        </span>
                      </td>
                      <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {item.batch_number || '—'}
                      </td>
                      <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                        {item.expiry_date || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Table footer summary */}
          {filteredItems.length > 0 && (
            <div style={{
              padding: '12px 16px', borderTop: '1px solid var(--color-border-subtle)',
              display: 'flex', gap: '24px', flexWrap: 'wrap',
              fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)',
            }}>
              <span>
                Total value at risk:{' '}
                <strong style={{ color: 'var(--color-warning-mid)' }}>
                  AED {fmtMoney(filteredItems.reduce((s, i) => s + i.lineValue, 0))}
                </strong>
              </span>
              <span>
                Records shown: <strong style={{ color: 'var(--color-text-primary)' }}>
                  {fmtNum(filteredItems.length)}
                </strong>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 2 — BY PHARMACY
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'pharmacies' && (
        <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="fm-table" style={{ minWidth: '800px' }}>
              <thead>
                <tr>
                  <th>Pharmacy</th>
                  <th style={{ textAlign: 'right' }}>Expired Value</th>
                  <th style={{ textAlign: 'right' }}>Critical Value</th>
                  <th style={{ textAlign: 'right' }}>Near Expiry Value</th>
                  <th style={{ textAlign: 'right' }}>Total at Risk</th>
                  <th style={{ textAlign: 'right' }}>Lines</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {risk.byPharmacy.map(p => {
                  const total = p.totalAtRiskValue
                  const priority = total > 10000 ? 'HIGH'
                                 : total > 1000  ? 'MEDIUM'
                                 :                 'LOW'
                  const pt = priority === 'HIGH' ? TONE.red : priority === 'MEDIUM' ? TONE.amber : TONE.green
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
                      <td style={{ textAlign: 'right', color: p.expiredValue > 0 ? TONE.red.color : 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        {p.expiredValue > 0 ? `AED ${fmtMoney(p.expiredValue)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: p.criticalValue > 0 ? TONE.red.color : 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        {p.criticalValue > 0 ? `AED ${fmtMoney(p.criticalValue)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: p.nearExpiryValue > 0 ? TONE.amber.color : 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        {p.nearExpiryValue > 0 ? `AED ${fmtMoney(p.nearExpiryValue)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)', color: total > 0 ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
                        {total > 0 ? `AED ${fmtMoney(total)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                        {fmtNum(p.expired + p.critical + p.nearExpiry)}
                      </td>
                      <td>
                        {total > 0 ? (
                          <span style={{
                            fontSize: 'var(--text-xs)', padding: '3px 8px',
                            borderRadius: 'var(--radius-pill)',
                            color: pt.color, background: pt.bg, border: `1px solid ${pt.border}`,
                          }}>
                            {priority}
                          </span>
                        ) : (
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>No risk</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 3 — BY THERAPEUTIC CLASS
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'classes' && (
        <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="fm-table" style={{ minWidth: '700px' }}>
              <thead>
                <tr>
                  <th>Therapeutic Class</th>
                  <th style={{ textAlign: 'right' }}>Expired</th>
                  <th style={{ textAlign: 'right' }}>Critical</th>
                  <th style={{ textAlign: 'right' }}>Near Expiry</th>
                  <th style={{ textAlign: 'right' }}>Total at Risk</th>
                  <th style={{ textAlign: 'right' }}>Lines</th>
                  <th style={{ textAlign: 'right' }}>% of Risk</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const totalRisk = risk.byClass.reduce((s, c) => s + c.atRiskValue, 0)
                  return risk.byClass.map(c => (
                    <tr key={c.therapeuticClass}>
                      <td style={{ fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
                        {c.therapeuticClass}
                      </td>
                      <td style={{ textAlign: 'right', color: c.expiredValue > 0 ? TONE.red.color : 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        {c.expiredValue > 0 ? `AED ${fmtMoney(c.expiredValue)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: c.criticalValue > 0 ? TONE.red.color : 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        {c.criticalValue > 0 ? `AED ${fmtMoney(c.criticalValue)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: c.nearExpiryValue > 0 ? TONE.amber.color : 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
                        {c.nearExpiryValue > 0 ? `AED ${fmtMoney(c.nearExpiryValue)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
                        {c.atRiskValue > 0 ? `AED ${fmtMoney(c.atRiskValue)}` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                        {fmtNum(c.atRiskCount)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                          <div style={{
                            width: '60px', height: '6px',
                            background: 'var(--color-bg-content)',
                            borderRadius: 'var(--radius-pill)', overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${totalRisk > 0 ? Math.round((c.atRiskValue / totalRisk) * 100) : 0}%`,
                              height: '100%',
                              background: 'var(--color-warning-mid)',
                              borderRadius: 'var(--radius-pill)',
                            }} />
                          </div>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', minWidth: '36px', textAlign: 'right' }}>
                            {totalRisk > 0 ? `${((c.atRiskValue / totalRisk) * 100).toFixed(1)}%` : '0%'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB 4 — REDISTRIBUTION OPPORTUNITIES
      ═══════════════════════════════════════════════════════ */}
      {activeTab === 'redistribution' && (
        <div>
          {/* Summary banner */}
          <div style={{
            padding: '16px 20px', marginBottom: '16px',
            background: TONE.green.bg, border: `1px solid ${TONE.green.border}`,
            borderRadius: 'var(--radius-lg)',
            display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Total recoverable
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 900, color: TONE.green.color }}>
                AED {fmtMoney(totalRecoverable)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Transfer opportunities
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 900, color: TONE.green.color }}>
                {fmtNum(redistribution.length)}
              </div>
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', maxWidth: '400px' }}>
              Each row represents a drug that is near-expiry at the source pharmacy
              and low-stock or out-of-stock at the destination. Transferring these
              units prevents expiry loss while resolving a shortage simultaneously.
            </div>
          </div>

          <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table" style={{ minWidth: '900px' }}>
                <thead>
                  <tr>
                    <th>Drug Code</th>
                    <th>Source Pharmacy</th>
                    <th>Destination Pharmacy</th>
                    <th style={{ textAlign: 'right' }}>Days Left</th>
                    <th style={{ textAlign: 'right' }}>Source Qty</th>
                    <th style={{ textAlign: 'right' }}>Transfer Qty</th>
                    <th style={{ textAlign: 'right' }}>Value Recoverable</th>
                    <th>Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {redistribution.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-tertiary)' }}>
                        No redistribution opportunities identified in current dataset.
                      </td>
                    </tr>
                  ) : redistribution.slice(0, 100).map((opp, idx) => (
                    <tr key={idx}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        {opp.drug_code}
                      </td>
                      <td>
                        <div style={{ color: TONE.amber.color, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>
                          {opp.sourcePharmacy}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                          {opp.sourcePharmacyCode}
                        </div>
                      </td>
                      <td>
                        <div style={{ color: TONE.green.color, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)' }}>
                          {opp.destinationPharmacy}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                          {opp.destinationPharmacyCode}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', color: opp.daysRemaining <= 29 ? TONE.red.color : TONE.amber.color, fontWeight: 'var(--font-medium)' }}>
                        {opp.daysRemaining}d
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
                        {fmtNum(opp.sourceQuantity)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
                        {fmtNum(opp.transferQuantity)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontWeight: 'var(--font-medium)', color: TONE.green.color }}>
                          AED {fmtMoney(opp.valueRecoverable)}
                        </span>
                      </td>
                      <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                        {opp.expiry_date || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {redistribution.length > 100 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border-subtle)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                Showing top 100 of {fmtNum(redistribution.length)} opportunities ranked by value recoverable.
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
  const t = TONE[tone] || TONE.amber
  return (
    <div className="fm-kpi-card" style={{ borderColor: t.border, boxShadow: `0 0 0 1px ${t.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <div className="fm-kpi-label">{label}</div>
        {badge && (
          <span style={{
            fontSize: '9px', padding: '2px 7px', borderRadius: 'var(--radius-pill)',
            color: t.color, background: t.bg, border: `1px solid ${t.border}`,
            fontWeight: 'var(--font-medium)', whiteSpace: 'nowrap',
          }}>
            {badge}
          </span>
        )}
      </div>
      <div className="fm-kpi-value" style={{ color: t.color }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>{sub}</div>
      )}
      {context && (
        <div style={{
          fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)',
          marginTop: '8px', paddingTop: '8px',
          borderTop: '1px solid var(--color-border-subtle)',
        }}>
          {context}
        </div>
      )}
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const selectStyle = {
  padding: '7px 10px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-default)',
  background: 'var(--color-bg-input)',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'var(--font-sans)',
}
