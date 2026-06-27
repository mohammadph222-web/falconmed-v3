/**
 * FalconMed v3 — Supply Chain Analytics Page
 * src/pages/SupplyChainAnalyticsPage.jsx
 *
 * Phase 5 — Network rebalancing, transfer analysis, adjustment patterns.
 * Consumes: computeRedistribution, computeOverstock
 * from src/analytics/inventoryAnalytics.js
 *
 * No new Supabase tables. No schema changes. Foundation untouched.
 */

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import {
  computeRedistribution,
  computeOverstock,
} from '../analytics/inventoryAnalytics'

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtNum(v) { return Number(v || 0).toLocaleString() }
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
  red:   { color: 'var(--color-danger-mid)',  bg: 'rgba(163,45,45,0.12)',   border: 'rgba(163,45,45,0.30)'   },
  amber: { color: 'var(--color-warning-mid)', bg: 'rgba(186,117,23,0.12)', border: 'rgba(186,117,23,0.30)' },
  green: { color: 'var(--color-success)',     bg: 'rgba(29,158,117,0.12)', border: 'rgba(29,158,117,0.30)' },
  blue:  { color: 'var(--color-primary)',     bg: 'rgba(24,95,165,0.12)',  border: 'rgba(24,95,165,0.30)'  },
  cyan:  { color: '#22d3ee',                  bg: 'rgba(34,211,238,0.10)', border: 'rgba(34,211,238,0.25)' },
}

// ─────────────────────────────────────────────────────────────────────────────
export default function SupplyChainAnalyticsPage() {
  const [loading, setLoading]         = useState(true)
  const [inventory, setInventory]     = useState([])
  const [pharmacies, setPharmacies]   = useState([])
  const [transactions, setTransactions] = useState([])

  const [activeTab,      setActiveTab]      = useState('rebalancing')
  const [searchTerm,     setSearchTerm]     = useState('')
  const [filterReason,   setFilterReason]   = useState('ALL')

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [invRes, pharmRes, txRes] = await Promise.all([
      supabase.from('inventory').select(
        'id, pharmacy_id, drug_code, quantity_on_hand, ' +
        'minimum_stock, maximum_stock, unit_cost, expiry_date, inventory_status'
      ),
      supabase.from('pharmacies').select('id, name, code, pharmacy_type'),
      supabase.from('inventory_transactions').select(
        'id, transaction_type, drug_code, quantity, notes, created_at, ' +
        'source_pharmacy_id, destination_pharmacy_id'
      ).order('created_at', { ascending: false }).limit(2000),
    ])
    setInventory(invRes.data     || [])
    setPharmacies(pharmRes.data  || [])
    setTransactions(txRes.data   || [])
    setLoading(false)
  }

  // ── Analytics ──────────────────────────────────────────────────────────────
  const redistribution = useMemo(
    () => computeRedistribution(inventory, pharmacies),
    [inventory, pharmacies]
  )
  const overstockData = useMemo(
    () => computeOverstock(inventory, pharmacies),
    [inventory, pharmacies]
  )

  // ── Transaction analysis ───────────────────────────────────────────────────
  const pharmMap = useMemo(
    () => new Map(pharmacies.map(p => [p.id, p])),
    [pharmacies]
  )

  const txSummary = useMemo(() => {
    const types = {}
    for (const tx of transactions) {
      const t = tx.transaction_type || 'UNKNOWN'
      if (!types[t]) types[t] = { count: 0, totalQty: 0 }
      types[t].count++
      types[t].totalQty += Number(tx.quantity || 0)
    }
    return types
  }, [transactions])

  // Transfer-out transactions with pharmacy names
  const transferOuts = useMemo(() => {
    return transactions
      .filter(tx => tx.transaction_type === 'TRANSFER_OUT')
      .map(tx => ({
        ...tx,
        sourceName: pharmMap.get(tx.source_pharmacy_id)?.name || '',
        destName:   pharmMap.get(tx.destination_pharmacy_id)?.name || '',
      }))
  }, [transactions, pharmMap])

  // Adjustment transactions
  const adjustments = useMemo(() => {
    return transactions.filter(tx =>
      tx.transaction_type === 'ADJUSTMENT_PLUS' ||
      tx.transaction_type === 'ADJUSTMENT_MINUS'
    ).map(tx => ({
      ...tx,
      pharmacyName: pharmMap.get(tx.source_pharmacy_id || tx.destination_pharmacy_id)?.name || '',
      reason: extractReason(tx.notes),
    }))
  }, [transactions, pharmMap])

  // Filter adjustment reasons
  const reasonOptions = useMemo(() => {
    const reasons = [...new Set(adjustments.map(a => a.reason).filter(Boolean))].sort()
    return reasons
  }, [adjustments])

  const filteredAdjustments = useMemo(() => {
    return adjustments.filter(a => {
      if (filterReason !== 'ALL' && a.reason !== filterReason) return false
      if (searchTerm) {
        const q = searchTerm.toLowerCase()
        return (
          (a.drug_code || '').toLowerCase().includes(q) ||
          (a.pharmacyName || '').toLowerCase().includes(q) ||
          (a.notes || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [adjustments, filterReason, searchTerm])

  // Filtered redistribution
  const filteredRedist = useMemo(() => {
    if (!searchTerm) return redistribution
    const q = searchTerm.toLowerCase()
    return redistribution.filter(r =>
      r.drug_code.toLowerCase().includes(q) ||
      r.sourcePharmacy.toLowerCase().includes(q) ||
      r.destinationPharmacy.toLowerCase().includes(q)
    )
  }, [redistribution, searchTerm])

  // Total recoverable value
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
              <h1 className="fm-page-header-title">Supply chain analytics</h1>
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
            <div className="fm-page-header-meta">Analytics · Supply Chain</div>
            <h1 className="fm-page-header-title">Supply chain analytics</h1>
            <p className="fm-page-header-desc">
              Network rebalancing opportunities, transfer history,
              overstock analysis, and inventory adjustment patterns.
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          SECTION 1 — KPI CARDS
      ═══════════════════════════════════════ */}
      <div className="fm-grid-kpi" style={{ marginBottom: '24px' }}>

        <KpiCard
          label="Rebalancing opportunities"
          value={fmtNum(redistribution.length)}
          sub={`AED ${fmtMoney(totalRecoverable)} recoverable`}
          context="Near-expiry surplus matched to shortage destinations"
          tone="green"
          badge="Act now"
        />
        <KpiCard
          label="Overstock lines"
          value={fmtNum(overstockData.items.length)}
          sub={`AED ${fmtMoneyCompact(overstockData.totalExcessValue)} excess value`}
          context="Items exceeding maximum stock — procurement freeze candidates"
          tone="amber"
          badge="Capital locked"
        />
        <KpiCard
          label="Transfer events"
          value={fmtNum(txSummary['TRANSFER_OUT']?.count || 0)}
          sub={`${fmtNum(txSummary['TRANSFER_OUT']?.totalQty || 0)} units moved`}
          context="Inter-pharmacy transfers recorded in the system"
          tone="blue"
        />
        <KpiCard
          label="Adjustment events"
          value={fmtNum(
            (txSummary['ADJUSTMENT_PLUS']?.count  || 0) +
            (txSummary['ADJUSTMENT_MINUS']?.count || 0)
          )}
          sub={`${fmtNum(txSummary['ADJUSTMENT_PLUS']?.count || 0)} plus · ${fmtNum(txSummary['ADJUSTMENT_MINUS']?.count || 0)} minus`}
          context="Stock corrections recorded — high rates indicate data quality issues"
          tone="cyan"
        />

      </div>

      {/* ═══════════════════════════════════════
          SECTION 2 — TABS
      ═══════════════════════════════════════ */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '16px',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        {[
          { key: 'rebalancing', label: `Rebalancing (${fmtNum(redistribution.length)})` },
          { key: 'overstock',   label: `Overstock (${fmtNum(overstockData.items.length)})` },
          { key: 'transfers',   label: `Transfers (${fmtNum(transferOuts.length)})` },
          { key: 'adjustments', label: `Adjustments (${fmtNum(adjustments.length)})` },
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

      {/* Shared search */}
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
          placeholder="Search drug code or pharmacy..."
          style={{ ...selectStyle, minWidth: '220px' }}
        />
        {activeTab === 'adjustments' && (
          <select value={filterReason} onChange={e => setFilterReason(e.target.value)} style={selectStyle}>
            <option value="ALL">All reasons</option>
            {reasonOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        {(searchTerm || filterReason !== 'ALL') && (
          <button className="fm-btn" onClick={() => { setSearchTerm(''); setFilterReason('ALL') }}>
            Reset
          </button>
        )}
      </div>

      {/* ═══════════════════════════════════════
          TAB 1 — REBALANCING OPPORTUNITIES
      ═══════════════════════════════════════ */}
      {activeTab === 'rebalancing' && (
        <div>
          {filteredRedist.length === 0 ? (
            <div className="fm-card" style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-tertiary)' }}>
              {redistribution.length === 0
                ? 'No rebalancing opportunities found. Near-expiry drugs do not match shortage locations in the current dataset.'
                : 'No records match the current search.'}
            </div>
          ) : (
            <>
              <div style={{
                padding: '14px 20px', marginBottom: '14px',
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
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', maxWidth: '480px' }}>
                  Each row identifies a drug that is near-expiry at the source pharmacy
                  while simultaneously in shortage at the destination. A transfer resolves
                  both the expiry risk and the shortage in a single operation.
                </div>
              </div>

              <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="fm-table" style={{ minWidth: '950px' }}>
                    <thead>
                      <tr>
                        <th>Drug Code</th>
                        <th>Source → Destination</th>
                        <th style={{ textAlign: 'right' }}>Days Left</th>
                        <th style={{ textAlign: 'right' }}>Source Qty</th>
                        <th style={{ textAlign: 'right' }}>Deficit at Dest</th>
                        <th style={{ textAlign: 'right' }}>Transfer Qty</th>
                        <th style={{ textAlign: 'right' }}>Value Recoverable</th>
                        <th>Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRedist.slice(0, 100).map((opp, idx) => (
                        <tr key={idx}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                            {opp.drug_code}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: 'var(--text-sm)', color: TONE.amber.color, fontWeight: 'var(--font-medium)' }}>
                                {opp.sourcePharmacy}
                              </span>
                              <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>→</span>
                              <span style={{ fontSize: 'var(--text-sm)', color: TONE.green.color, fontWeight: 'var(--font-medium)' }}>
                                {opp.destinationPharmacy}
                              </span>
                            </div>
                            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                              {opp.sourcePharmacyCode} → {opp.destinationPharmacyCode}
                            </div>
                          </td>
                          <td style={{
                            textAlign: 'right', fontWeight: 'var(--font-medium)',
                            color: opp.daysRemaining <= 29 ? TONE.red.color : TONE.amber.color,
                          }}>
                            {opp.daysRemaining}d
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                            {fmtNum(opp.sourceQuantity)}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: TONE.red.color }}>
                            {fmtNum(opp.deficitAtDest)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
                            {fmtNum(opp.transferQuantity)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)', color: TONE.green.color }}>
                            AED {fmtMoney(opp.valueRecoverable)}
                          </td>
                          <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                            {opp.expiry_date || '—'}
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
          TAB 2 — OVERSTOCK
      ═══════════════════════════════════════ */}
      {activeTab === 'overstock' && (
        <div>
          {overstockData.items.length === 0 ? (
            <div className="fm-card" style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-tertiary)' }}>
              No overstock detected — all items are within maximum stock levels.
            </div>
          ) : (
            <>
              {/* Overstock by pharmacy */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: '12px', marginBottom: '16px' }}>
                {overstockData.byPharmacy.slice(0, 6).map(p => (
                  <div key={p.pharmacyId} className="fm-card" style={{ padding: '14px 18px' }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                      {p.pharmacyName}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        {fmtNum(p.overstockCount)} lines
                      </span>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: TONE.amber.color }}>
                        AED {fmtMoneyCompact(p.excessValue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table className="fm-table" style={{ minWidth: '800px' }}>
                    <thead>
                      <tr>
                        <th>Drug Code</th>
                        <th>Pharmacy</th>
                        <th style={{ textAlign: 'right' }}>Current Qty</th>
                        <th style={{ textAlign: 'right' }}>Max Stock</th>
                        <th style={{ textAlign: 'right' }}>Excess</th>
                        <th style={{ textAlign: 'right' }}>Excess Value</th>
                        <th>Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overstockData.items
                        .filter(i => !searchTerm || i.drug_code.toLowerCase().includes(searchTerm.toLowerCase()) || i.pharmacyName.toLowerCase().includes(searchTerm.toLowerCase()))
                        .slice(0, 200)
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
                            <td style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                              {fmtNum(item.maximum_stock)}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)', color: TONE.amber.color }}>
                              +{fmtNum(item.excessQuantity)}
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
          TAB 3 — TRANSFER HISTORY
      ═══════════════════════════════════════ */}
      {activeTab === 'transfers' && (
        <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
          {transferOuts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-tertiary)' }}>
              No transfer records found in the transaction log.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table" style={{ minWidth: '800px' }}>
                <thead>
                  <tr>
                    <th>Drug Code</th>
                    <th>Source</th>
                    <th>Destination</th>
                    <th style={{ textAlign: 'right' }}>Quantity</th>
                    <th>Notes</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transferOuts
                    .filter(tx => !searchTerm ||
                      (tx.drug_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      tx.sourceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      tx.destName.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .slice(0, 200)
                    .map(tx => (
                      <tr key={tx.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                          {tx.drug_code || '—'}
                        </td>
                        <td style={{ fontSize: 'var(--text-sm)', color: TONE.amber.color }}>
                          {tx.sourceName || '—'}
                        </td>
                        <td style={{ fontSize: 'var(--text-sm)', color: TONE.green.color }}>
                          {tx.destName || '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
                          {fmtNum(tx.quantity)}
                        </td>
                        <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', maxWidth: '260px' }}>
                          {tx.notes || '—'}
                        </td>
                        <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                          {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB 4 — ADJUSTMENTS
      ═══════════════════════════════════════ */}
      {activeTab === 'adjustments' && (
        <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
          {adjustments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--color-text-tertiary)' }}>
              No adjustment records found in the transaction log.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="fm-table" style={{ minWidth: '750px' }}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Drug Code</th>
                    <th>Pharmacy</th>
                    <th style={{ textAlign: 'right' }}>Quantity</th>
                    <th>Reason</th>
                    <th>Notes</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdjustments.slice(0, 200).map(tx => {
                    const isPlus = tx.transaction_type === 'ADJUSTMENT_PLUS'
                    return (
                      <tr key={tx.id}>
                        <td>
                          <span style={{
                            fontSize: 'var(--text-xs)', padding: '3px 8px',
                            borderRadius: 'var(--radius-pill)',
                            color: isPlus ? TONE.green.color : TONE.red.color,
                            background: isPlus ? TONE.green.bg : TONE.red.bg,
                            border: `1px solid ${isPlus ? TONE.green.border : TONE.red.border}`,
                          }}>
                            {isPlus ? '+ Plus' : '− Minus'}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                          {tx.drug_code || '—'}
                        </td>
                        <td style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                          {tx.pharmacyName || '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'var(--font-medium)', color: isPlus ? TONE.green.color : TONE.red.color }}>
                          {isPlus ? '+' : '−'}{fmtNum(tx.quantity)}
                        </td>
                        <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                          {tx.reason || '—'}
                        </td>
                        <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', maxWidth: '240px' }}>
                          {tx.notes ? tx.notes.slice(0, 80) : '—'}
                        </td>
                        <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                          {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractReason(notes) {
  if (!notes) return 'NOT_SPECIFIED'
  const match = notes.match(/Reason:\s*([A-Z_]+)/)
  return match ? match[1] : 'NOT_SPECIFIED'
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
