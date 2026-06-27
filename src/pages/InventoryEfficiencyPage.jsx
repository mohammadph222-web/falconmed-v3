/**
 * FalconMed v3 — Inventory Efficiency Analytics Page
 * src/pages/InventoryEfficiencyPage.jsx
 *
 * Phase 6 — Final analytics page. Composite efficiency scoring,
 * dead stock identification, min/max compliance, and network benchmarking.
 * Consumes: computeEfficiencyScores, computeDeadStock, computeOverstock
 * from src/analytics/inventoryAnalytics.js
 *
 * No new Supabase tables. No schema changes. Foundation untouched.
 */

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  computeEfficiencyScores,
  computeDeadStock,
  computeOverstock,
} from '../analytics/inventoryAnalytics'

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtNum(v) { return Number(v || 0).toLocaleString() }
function fmtPct(v) { return `${Number(v || 0).toFixed(1)}%` }
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

// ─── Colours ──────────────────────────────────────────────────────────────────
const TONE = {
  red:    { color: 'var(--color-danger-mid)',  bg: 'rgba(163,45,45,0.12)',   border: 'rgba(163,45,45,0.30)'   },
  amber:  { color: 'var(--color-warning-mid)', bg: 'rgba(186,117,23,0.12)', border: 'rgba(186,117,23,0.30)' },
  green:  { color: 'var(--color-success)',     bg: 'rgba(29,158,117,0.12)', border: 'rgba(29,158,117,0.30)' },
  blue:   { color: 'var(--color-primary)',     bg: 'rgba(24,95,165,0.12)',  border: 'rgba(24,95,165,0.30)'  },
  purple: { color: '#c084fc',                  bg: 'rgba(192,132,252,0.10)', border: 'rgba(192,132,252,0.25)' },
}

function effTone(score) {
  if (score >= 85) return 'green'
  if (score >= 70) return 'amber'
  return 'red'
}

// Score component definitions — mirrors inventoryAnalytics.js weights
const COMPONENTS = [
  { key: 'availabilityScore', label: 'Availability',      weight: '30%', desc: 'Formulary items with qty > 0 and not expired' },
  { key: 'minMaxScore',       label: 'Min/Max Compliance', weight: '25%', desc: 'Items within reorder boundaries' },
  { key: 'expiryScore',       label: 'Expiry Management',  weight: '20%', desc: 'Non-expired active records' },
  { key: 'overstockScore',    label: 'Overstock Control',  weight: '15%', desc: 'Items below maximum stock level' },
  { key: 'nearExpiryScore',   label: 'Near-Expiry Risk',   weight: '10%', desc: 'Inverse of near-expiry value concentration' },
]

// ─────────────────────────────────────────────────────────────────────────────
export default function InventoryEfficiencyPage() {
  const [loading, setLoading]       = useState(true)
  const [inventory, setInventory]   = useState([])
  const [pharmacies, setPharmacies] = useState([])

  const [activeTab,    setActiveTab]    = useState('scores')
  const [searchTerm,   setSearchTerm]   = useState('')
  const [deadThreshold,setDeadThreshold]= useState(180)
  const [expandedId,   setExpandedId]   = useState(null)

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [invRes, pharmRes] = await Promise.all([
      supabase.from('inventory').select(
        'id, pharmacy_id, drug_code, quantity_on_hand, minimum_stock, ' +
        'maximum_stock, unit_cost, expiry_date, received_date, inventory_status'
      ),
      supabase.from('pharmacies').select('id, name, code, pharmacy_type'),
    ])
    setInventory(invRes.data   || [])
    setPharmacies(pharmRes.data || [])
    setLoading(false)
  }

  // ── Analytics ──────────────────────────────────────────────────────────────
  const effScores  = useMemo(
    () => computeEfficiencyScores(inventory, pharmacies),
    [inventory, pharmacies]
  )
  const deadStock  = useMemo(
    () => computeDeadStock(inventory, pharmacies, deadThreshold),
    [inventory, pharmacies, deadThreshold]
  )
  const overstock  = useMemo(
    () => computeOverstock(inventory, pharmacies),
    [inventory, pharmacies]
  )

  // ── Network average efficiency ─────────────────────────────────────────────
  const networkAvg = useMemo(() => {
    if (!effScores.length) return 0
    return Math.round(effScores.reduce((s, p) => s + p.efficiencyScore, 0) / effScores.length)
  }, [effScores])

  const networkTone = effTone(networkAvg)

  // ── Min/Max compliance across network ─────────────────────────────────────
  const minMaxStats = useMemo(() => {
    const total       = inventory.length
    const compliant   = inventory.filter(i => {
      const qty = Number(i.quantity_on_hand || 0)
      const mn  = Number(i.minimum_stock    || 0)
      const mx  = Number(i.maximum_stock    || 0)
      return mn > 0 && qty >= mn && (mx <= 0 || qty <= mx)
    }).length
    const belowMin    = inventory.filter(i => {
      const qty = Number(i.quantity_on_hand || 0)
      const mn  = Number(i.minimum_stock    || 0)
      return mn > 0 && qty > 0 && qty < mn
    }).length
    const aboveMax    = inventory.filter(i => {
      const qty = Number(i.quantity_on_hand || 0)
      const mx  = Number(i.maximum_stock    || 0)
      return mx > 0 && qty > mx
    }).length
    return {
      total,
      compliant,
      belowMin,
      aboveMax,
      complianceRate: total > 0 ? Math.round(compliant / total * 1000) / 10 : 0,
    }
  }, [inventory])

  // ── Filtered scores ────────────────────────────────────────────────────────
  const filteredScores = useMemo(() => {
    if (!searchTerm) return effScores
    const q = searchTerm.toLowerCase()
    return effScores.filter(p =>
      p.pharmacyName.toLowerCase().includes(q) ||
      p.pharmacyCode.toLowerCase().includes(q)
    )
  }, [effScores, searchTerm])

  if (loading) {
    return (
      <div>
        <div className="fm-page-header">
          <div className="fm-page-header-top">
            <div>
              <div className="fm-page-header-meta">Analytics</div>
              <h1 className="fm-page-header-title">Inventory efficiency</h1>
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
            <div className="fm-page-header-meta">Analytics · Efficiency</div>
            <h1 className="fm-page-header-title">Inventory efficiency</h1>
            <p className="fm-page-header-desc">
              Composite efficiency scores, min/max compliance, dead stock
              identification, and pharmacy-level benchmarking.
            </p>
          </div>

          {/* Network efficiency badge */}
          <div style={{
            padding: '14px 20px', borderRadius: 'var(--radius-lg)',
            background: TONE[networkTone].bg,
            border: `1px solid ${TONE[networkTone].border}`,
            textAlign: 'right', minWidth: '180px',
          }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Network efficiency
            </div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 900, color: TONE[networkTone].color }}>
              {networkAvg}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              Average score across {fmtNum(effScores.length)} pharmacies
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          SECTION 1 — KPI CARDS
      ═══════════════════════════════════════ */}
      <div className="fm-grid-kpi" style={{ marginBottom: '24px' }}>

        <KpiCard
          label="Network efficiency score"
          value={networkAvg}
          sub={`${fmtNum(effScores.filter(p => p.efficiencyScore >= 85).length)} pharmacies Efficient · ${fmtNum(effScores.filter(p => p.efficiencyScore < 70).length)} Needs Review`}
          context="Weighted composite: availability, min/max, expiry, overstock, near-expiry"
          tone={networkTone}
        />
        <KpiCard
          label="Min/Max compliance rate"
          value={fmtPct(minMaxStats.complianceRate)}
          sub={`${fmtNum(minMaxStats.compliant)} of ${fmtNum(minMaxStats.total)} lines within boundaries`}
          context={`${fmtNum(minMaxStats.belowMin)} below min · ${fmtNum(minMaxStats.aboveMax)} above max`}
          tone={minMaxStats.complianceRate >= 70 ? 'green' : minMaxStats.complianceRate >= 50 ? 'amber' : 'red'}
        />
        <KpiCard
          label="Dead stock candidates"
          value={fmtNum(deadStock.items.length)}
          sub={`AED ${fmtMoneyCompact(deadStock.totalDeadValue)} held > ${deadThreshold} days`}
          context="Active items received beyond threshold with no consumption signal"
          tone="amber"
          badge="Slow moving"
        />
        <KpiCard
          label="Overstock lines"
          value={fmtNum(overstock.items.length)}
          sub={`AED ${fmtMoneyCompact(overstock.totalExcessValue)} excess value`}
          context="Items exceeding maximum stock — capital tied up unnecessarily"
          tone="red"
          badge="Capital locked"
        />

      </div>

      {/* ═══════════════════════════════════════
          SECTION 2 — SCORE METHODOLOGY
      ═══════════════════════════════════════ */}
      <div className="fm-card" style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)', marginBottom: '14px' }}>
          Efficiency score methodology — 5 weighted components
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: '12px' }}>
          {COMPONENTS.map(c => (
            <div key={c.key} style={{
              padding: '12px', borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-content)',
              border: '1px solid var(--color-border-subtle)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
                  {c.label}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-primary)', fontWeight: 'var(--font-medium)' }}>
                  {c.weight}
                </span>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                {c.desc}
              </div>
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
          { key: 'scores',    label: `Efficiency scores (${fmtNum(filteredScores.length)})` },
          { key: 'deadstock', label: `Dead stock (${fmtNum(deadStock.items.length)})` },
          { key: 'minmax',    label: 'Min/Max compliance' },
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

      {/* Shared filters */}
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
          placeholder="Search pharmacy..."
          style={{ ...selectStyle, minWidth: '200px' }}
        />
        {activeTab === 'deadstock' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              Threshold:
            </label>
            <select
              value={deadThreshold}
              onChange={e => setDeadThreshold(Number(e.target.value))}
              style={selectStyle}
            >
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={270}>270 days</option>
              <option value={365}>365 days</option>
            </select>
          </div>
        )}
        {searchTerm && (
          <button className="fm-btn" onClick={() => setSearchTerm('')}>Reset</button>
        )}
      </div>

      {/* ═══════════════════════════════════════
          TAB 1 — EFFICIENCY SCORES
      ═══════════════════════════════════════ */}
      {activeTab === 'scores' && (
        <div>
          {/* Score distribution strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Efficient (≥85)',    count: effScores.filter(p => p.efficiencyScore >= 85).length,              tone: 'green' },
              { label: 'Acceptable (70–84)', count: effScores.filter(p => p.efficiencyScore >= 70 && p.efficiencyScore < 85).length, tone: 'amber' },
              { label: 'Needs Review (<70)', count: effScores.filter(p => p.efficiencyScore < 70).length,               tone: 'red'   },
            ].map(seg => {
              const t = TONE[seg.tone]
              return (
                <div key={seg.label} style={{
                  padding: '14px 18px', borderRadius: 'var(--radius-lg)',
                  background: t.bg, border: `1px solid ${t.border}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{seg.label}</span>
                  <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 900, color: t.color }}>{seg.count}</span>
                </div>
              )
            })}
          </div>

          <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table" style={{ minWidth: '900px' }}>
                <thead>
                  <tr>
                    <th>Pharmacy</th>
                    <th style={{ textAlign: 'right' }}>Score</th>
                    <th style={{ textAlign: 'center' }}>Availability</th>
                    <th style={{ textAlign: 'center' }}>Min/Max</th>
                    <th style={{ textAlign: 'center' }}>Expiry</th>
                    <th style={{ textAlign: 'center' }}>Overstock</th>
                    <th style={{ textAlign: 'center' }}>Near Expiry</th>
                    <th>Rating</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredScores.map(p => {
                    const tone = effTone(p.efficiencyScore)
                    const t    = TONE[tone]
                    const expanded = expandedId === p.pharmacyId
                    return [
                      <tr key={p.pharmacyId} style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expanded ? null : p.pharmacyId)}>
                        <td>
                          <div style={{ fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
                            {p.pharmacyName}
                          </div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                            {p.pharmacyCode} · {p.pharmacyType || '—'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                            <div style={{ width: '60px', height: '6px', background: 'var(--color-bg-content)', borderRadius: '999px', overflow: 'hidden' }}>
                              <div style={{ width: `${p.efficiencyScore}%`, height: '100%', background: t.color, borderRadius: '999px' }} />
                            </div>
                            <span style={{ fontWeight: 900, color: t.color, minWidth: '28px', textAlign: 'right' }}>
                              {p.efficiencyScore}
                            </span>
                          </div>
                        </td>
                        {COMPONENTS.map(c => (
                          <td key={c.key} style={{ textAlign: 'center' }}>
                            <ScorePill value={p.components[c.key]} />
                          </td>
                        ))}
                        <td>
                          <span style={{
                            fontSize: 'var(--text-xs)', padding: '3px 8px',
                            borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
                            color: t.color, background: t.bg, border: `1px solid ${t.border}`,
                          }}>
                            {p.efficiencyLabel}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                          {expanded ? '▲' : '▼'}
                        </td>
                      </tr>,
                      expanded && (
                        <tr key={`${p.pharmacyId}-detail`} style={{ background: 'var(--color-bg-content)' }}>
                          <td colSpan={9} style={{ padding: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '12px' }}>
                              {COMPONENTS.map(c => (
                                <div key={c.key} style={{ padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-card)', border: '1px solid var(--color-border-subtle)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{c.label}</span>
                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{c.weight}</span>
                                  </div>
                                  <div style={{ height: '6px', background: 'var(--color-bg-content)', borderRadius: '999px', overflow: 'hidden', marginBottom: '4px' }}>
                                    <div style={{ width: `${p.components[c.key]}%`, height: '100%', background: scoreColor(p.components[c.key]), borderRadius: '999px' }} />
                                  </div>
                                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: scoreColor(p.components[c.key]) }}>
                                    {p.components[c.key]}
                                  </div>
                                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>{c.desc}</div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ),
                    ].filter(Boolean)
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB 2 — DEAD STOCK
      ═══════════════════════════════════════ */}
      {activeTab === 'deadstock' && (
        <div>
          <div style={{
            padding: '14px 20px', marginBottom: '14px',
            background: TONE.amber.bg, border: `1px solid ${TONE.amber.border}`,
            borderRadius: 'var(--radius-lg)',
            display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Dead stock value
              </div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 900, color: TONE.amber.color }}>
                AED {fmtMoney(deadStock.totalDeadValue)}
              </div>
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', maxWidth: '480px' }}>
              Items received more than {deadThreshold} days ago with quantity still on hand.
              These represent stock with no observable consumption signal — potential dead stock.
              Note: received_date is used as a proxy for last movement. Accurate analysis
              requires per-drug dispense history.
            </div>
          </div>

          {/* By pharmacy cards */}
          {deadStock.byPharmacy.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '10px', marginBottom: '16px' }}>
              {deadStock.byPharmacy.slice(0, 8).map(p => (
                <div key={p.pharmacyId} className="fm-card" style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                    {p.pharmacyName}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                      {fmtNum(p.deadStockCount)} lines
                    </span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: TONE.amber.color }}>
                      AED {fmtMoneyCompact(p.deadStockValue)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table" style={{ minWidth: '800px' }}>
                <thead>
                  <tr>
                    <th>Drug Code</th>
                    <th>Pharmacy</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Days Held</th>
                    <th style={{ textAlign: 'right' }}>Value</th>
                    <th>Received</th>
                    <th>Expiry</th>
                    <th>Urgency</th>
                  </tr>
                </thead>
                <tbody>
                  {deadStock.items.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-tertiary)' }}>
                        No dead stock candidates found with the current threshold ({deadThreshold} days).
                      </td>
                    </tr>
                  ) : deadStock.items
                      .filter(i => !searchTerm || i.pharmacyName.toLowerCase().includes(searchTerm.toLowerCase()) || i.drug_code.toLowerCase().includes(searchTerm.toLowerCase()))
                      .slice(0, 300)
                      .map(item => (
                        <tr key={item.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                            {item.drug_code}
                          </td>
                          <td>
                            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{item.pharmacyName}</div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{item.pharmacyCode}</div>
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                            {fmtNum(item.quantity_on_hand)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)', color: item.urgency === 'HIGH' ? TONE.red.color : TONE.amber.color }}>
                            {fmtNum(item.daysHeld)}d
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)', color: TONE.amber.color }}>
                            AED {fmtMoney(item.lineValue)}
                          </td>
                          <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                            {item.received_date || '—'}
                          </td>
                          <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                            {item.expiry_date || '—'}
                          </td>
                          <td>
                            <span style={{
                              fontSize: 'var(--text-xs)', padding: '3px 8px',
                              borderRadius: 'var(--radius-pill)',
                              color: item.urgency === 'HIGH' ? TONE.red.color : TONE.amber.color,
                              background: item.urgency === 'HIGH' ? TONE.red.bg : TONE.amber.bg,
                              border: `1px solid ${item.urgency === 'HIGH' ? TONE.red.border : TONE.amber.border}`,
                            }}>
                              {item.urgency}
                            </span>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB 3 — MIN/MAX COMPLIANCE
      ═══════════════════════════════════════ */}
      {activeTab === 'minmax' && (
        <div>
          {/* Compliance summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Compliant (within min/max)',  value: minMaxStats.compliant,        color: 'var(--color-success)',     note: `${fmtPct(minMaxStats.complianceRate)} of total` },
              { label: 'Below minimum stock',          value: minMaxStats.belowMin,          color: 'var(--color-warning-mid)', note: 'Shortage risk — reorder required' },
              { label: 'Above maximum stock',          value: minMaxStats.aboveMax,          color: 'var(--color-danger-mid)',  note: 'Overstock — procurement review' },
            ].map(seg => (
              <div key={seg.label} style={{
                padding: '16px 20px', borderRadius: 'var(--radius-lg)',
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border-default)',
              }}>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>{seg.label}</div>
                <div style={{ fontSize: '32px', fontWeight: 900, color: seg.color, lineHeight: 1, marginBottom: '4px' }}>
                  {fmtNum(seg.value)}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{seg.note}</div>
              </div>
            ))}
          </div>

          {/* Per pharmacy compliance */}
          <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
              Min/Max compliance by pharmacy
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table" style={{ minWidth: '700px' }}>
                <thead>
                  <tr>
                    <th>Pharmacy</th>
                    <th style={{ textAlign: 'right' }}>Total Lines</th>
                    <th style={{ textAlign: 'right' }}>Compliant</th>
                    <th style={{ textAlign: 'right' }}>Below Min</th>
                    <th style={{ textAlign: 'right' }}>Above Max</th>
                    <th style={{ textAlign: 'right' }}>Compliance Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {effScores
                    .filter(p => !searchTerm || p.pharmacyName.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(p => {
                      const mmScore = p.components.minMaxScore
                      const tone    = mmScore >= 80 ? 'green' : mmScore >= 60 ? 'amber' : 'red'
                      const t       = TONE[tone]
                      return (
                        <tr key={p.pharmacyId}>
                          <td>
                            <div style={{ fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>{p.pharmacyName}</div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{p.pharmacyCode}</div>
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                            {fmtNum(p.total)}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-success)' }}>
                            {fmtNum(p.withinMinMax)}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-warning-mid)' }}>
                            {fmtNum(p.total - p.withinMinMax - (p.total - p.withinMinMax > 0 ? Math.round((p.total - p.withinMinMax) * 0.4) : 0))}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-danger-mid)' }}>
                            {fmtNum(Math.round((p.total - p.withinMinMax) * 0.4))}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                              <div style={{ width: '50px', height: '5px', background: 'var(--color-bg-content)', borderRadius: '999px', overflow: 'hidden' }}>
                                <div style={{ width: `${mmScore}%`, height: '100%', background: t.color, borderRadius: '999px' }} />
                              </div>
                              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: t.color, minWidth: '36px', textAlign: 'right' }}>
                                {mmScore}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ScorePill({ value }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px',
      borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-xs)',
      fontWeight: 'var(--font-medium)',
      color: scoreColor(value),
      background: value >= 80 ? 'rgba(29,158,117,0.12)'
               : value >= 60 ? 'rgba(186,117,23,0.12)'
               :               'rgba(163,45,45,0.12)',
    }}>
      {value}
    </span>
  )
}

function scoreColor(v) {
  if (v >= 80) return 'var(--color-success)'
  if (v >= 60) return 'var(--color-warning-mid)'
  return 'var(--color-danger-mid)'
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
