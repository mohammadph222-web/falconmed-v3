import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function StockCountPage() {
  const [sessions, setSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [savingItemId, setSavingItemId] = useState(null)
  const [reconcilingSessionId, setReconcilingSessionId] = useState(null)

  useEffect(() => {
    loadSessions()
  }, [])

  const stats = useMemo(() => {
    const total = items.length
    const matched = items.filter((item) => item.status === 'MATCHED').length
    const variance = items.filter((item) => item.status === 'VARIANCE').length
    const pending = items.filter(
      (item) => !item.status || item.status === 'PENDING'
    ).length
    const reconciled = items.filter(
      (item) => item.status === 'RECONCILED'
    ).length
    return { total, matched, variance, pending, reconciled }
  }, [items])

  async function loadSessions() {
    setLoading(true)

    const { data, error } = await supabase
      .from('stock_count_sessions')
      .select('*')
      .order('started_at', { ascending: false })

    if (error) {
      console.error(error)
      setSessions([])
      setLoading(false)
      return
    }

    setSessions(data || [])
    setLoading(false)
  }

  async function openSession(session) {
    setSelectedSession(session)
    setItemsLoading(true)

    const { data, error } = await supabase
      .from('vw_stock_count_items_detail')
      .select('*')
      .eq('session_id', session.id)
      .order('drug_code', { ascending: true })

    if (error) {
      console.error(error)
      setItems([])
      setItemsLoading(false)
      return
    }

    setItems(data || [])
    setItemsLoading(false)
  }

  function updateLocalCount(itemId, value) {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              counted_quantity: value,
              variance:
                value === ''
                  ? null
                  : Number(value) - Number(item.system_quantity || 0),
            }
          : item
      )
    )
  }

  async function saveCount(item) {
    const counted =
      item.counted_quantity === '' || item.counted_quantity === null
        ? null
        : Number(item.counted_quantity)

    if (counted === null || Number.isNaN(counted)) {
      alert('Please enter a valid counted quantity.')
      return
    }

    const variance = counted - Number(item.system_quantity || 0)
    const status = variance === 0 ? 'MATCHED' : 'VARIANCE'

    setSavingItemId(item.id)

    const { error } = await supabase
      .from('stock_count_items')
      .update({ counted_quantity: counted, variance, status })
      .eq('id', item.id)

    if (error) {
      console.error(error)
      alert(`Failed to save count: ${error.message}`)
      setSavingItemId(null)
      return
    }

    setItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === item.id
          ? { ...currentItem, counted_quantity: counted, variance, status }
          : currentItem
      )
    )

    setSavingItemId(null)
  }

  async function generateReconciliationCases(session) {
    const confirmGenerate = window.confirm(
      `Generate reconciliation cases for "${session.session_name}"?\n\nOnly variance items will be converted into reconciliation cases.`
    )

    if (!confirmGenerate) return

    setReconcilingSessionId(session.id)

    const { data: stockItems, error: itemsError } = await supabase
      .from('stock_count_items')
      .select('*')
      .eq('session_id', session.id)
      .eq('status', 'VARIANCE')
      .neq('variance', 0)

    if (itemsError) {
      console.error(itemsError)
      alert(`Failed to load stock count items: ${itemsError.message}`)
      setReconcilingSessionId(null)
      return
    }

    const varianceItems = stockItems || []

    if (varianceItems.length === 0) {
      alert('No active VARIANCE items found. Nothing to reconcile.')
      setReconcilingSessionId(null)
      return
    }

    const { data: existingCases, error: existingError } = await supabase
      .from('reconciliation_cases')
      .select('stock_count_item_id')
      .eq('stock_count_session_id', session.id)

    if (existingError) {
      console.error('EXISTING ERROR:', existingError)
      alert(`Failed to check existing cases: ${existingError.message}`)
      setReconcilingSessionId(null)
      return
    }

    const existingItemIds = new Set(
      (existingCases || []).map((caseItem) => caseItem.stock_count_item_id)
    )

    const newCaseRows = varianceItems
      .filter((item) => !existingItemIds.has(item.id))
      .map((item) => {
        const variance = Number(item.variance || 0)
        return {
          stock_count_session_id: session.id,
          stock_count_item_id: item.id,
          pharmacy_id: item.pharmacy_id || session.pharmacy_id || null,
          drug_code: item.drug_code || null,
          batch_number: item.batch_number || null,
          expiry_date: item.expiry_date || null,
          system_quantity: Number(item.system_quantity || 0),
          counted_quantity: Number(item.counted_quantity || 0),
          variance,
          variance_type:
            variance > 0 ? 'POSITIVE' : variance < 0 ? 'NEGATIVE' : 'ZERO',
          reason: null,
          notes: null,
          status: 'PENDING',
        }
      })

    if (newCaseRows.length === 0) {
      alert(
        'Reconciliation cases already exist for all active variance items.'
      )
      setReconcilingSessionId(null)
      return
    }

    const { data: createdCases, error: insertError } = await supabase
      .from('reconciliation_cases')
      .insert(newCaseRows)
      .select('*')

    if (insertError) {
      console.error('INSERT ERROR:', insertError)
      alert(`Insert error: ${JSON.stringify(insertError)}`)
      setReconcilingSessionId(null)
      return
    }

    const auditRows = (createdCases || []).map((caseItem) => ({
      reconciliation_case_id: caseItem.id,
      action: 'CASE_CREATED',
      previous_status: null,
      new_status: 'PENDING',
      previous_quantity: caseItem.system_quantity,
      new_quantity: caseItem.counted_quantity,
      reason: null,
      notes: 'Reconciliation case generated from stock count variance.',
      approval_status: 'PENDING',
      performed_by: 'system',
    }))

    if (auditRows.length > 0) {
      const { error: auditError } = await supabase
        .from('reconciliation_audit_trail')
        .insert(auditRows)

      if (auditError) {
        console.error(auditError)
        alert(
          `Cases were created, but audit trail failed: ${auditError.message}`
        )
        setReconcilingSessionId(null)
        return
      }
    }

    alert(
      `Reconciliation generated successfully.\n\nNew cases created: ${newCaseRows.length}`
    )

    setReconcilingSessionId(null)
  }

  return (
    <div>
      <div className="fm-page-header">
        <div className="fm-page-header-top">
          <div>
            <div className="fm-page-header-meta">Operations</div>
            <h1 className="fm-page-header-title">Stock count</h1>
            <p className="fm-page-header-desc">
              Manage stock count sessions, record physical counts, and
              generate reconciliation cases from variances.
            </p>
          </div>
          <div className="fm-page-header-actions">
            <button className="fm-btn" onClick={loadSessions}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div
          className="fm-card"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Loading sessions...
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div className="fm-empty-state">
          <div className="fm-empty-state-title">No stock count sessions</div>
          <div className="fm-empty-state-desc">
            Sessions will appear here once created.
          </div>
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div className="fm-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
          <div className="fm-table-wrap">
            <table className="fm-table">
              <thead>
                <tr>
                  <th>Session name</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td>
                      <div
                        style={{
                          fontWeight: 'var(--font-medium)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {session.session_name}
                      </div>
                    </td>
                    <td>
                      <SessionStatusBadge status={session.status} />
                    </td>
                    <td className="fm-table-muted">
                      {formatDate(session.started_at)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => openSession(session)}
                          className="fm-btn"
                          style={{ fontSize: 'var(--text-xs)', padding: '4px 12px' }}
                        >
                          Open
                        </button>
                        {session.status === 'COMPLETED' && (
                          <button
                            onClick={() => generateReconciliationCases(session)}
                            disabled={reconcilingSessionId === session.id}
                            className="fm-btn"
                            style={{
                              fontSize: 'var(--text-xs)',
                              padding: '4px 12px',
                              opacity: reconcilingSessionId === session.id ? 0.6 : 1,
                              background: 'rgba(124,58,237,0.15)',
                              borderColor: 'rgba(124,58,237,0.4)',
                              color: '#c084fc',
                            }}
                          >
                            {reconcilingSessionId === session.id
                              ? 'Generating...'
                              : 'Generate reconciliation'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedSession && (
        <div className="fm-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              marginBottom: '16px',
              paddingBottom: '14px',
              borderBottom: '1px solid var(--color-border-subtle)',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 'var(--text-lg)',
                  fontWeight: 'var(--font-medium)',
                  color: 'var(--color-text-primary)',
                  margin: 0,
                }}
              >
                {selectedSession.session_name}
              </h2>
              <p
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-secondary)',
                  margin: '4px 0 0',
                }}
              >
                {items.length.toLocaleString()} items ·{' '}
                <SessionStatusBadge status={selectedSession.status} />
              </p>
            </div>
            <button
              className="fm-btn"
              style={{ fontSize: 'var(--text-xs)', padding: '4px 10px' }}
              onClick={() => setSelectedSession(null)}
            >
              ✕ Close
            </button>
          </div>

          <div className="fm-grid-kpi" style={{ marginBottom: '20px' }}>
            <CountKpiCard
              label="Total items"
              value={stats.total}
              color="var(--color-text-accent)"
              barColor="var(--color-primary)"
            />
            <CountKpiCard
              label="Matched"
              value={stats.matched}
              color="var(--color-success)"
              barColor="var(--color-success)"
            />
            <CountKpiCard
              label="Pending"
              value={stats.pending}
              color="var(--color-warning-mid)"
              barColor="var(--color-warning-mid)"
            />
            <CountKpiCard
              label="Variance"
              value={stats.variance}
              color="var(--color-danger-mid)"
              barColor="var(--color-danger-mid)"
            />
            <CountKpiCard
              label="Reconciled"
              value={stats.reconciled}
              color="#c084fc"
              barColor="#c084fc"
            />
          </div>

          {itemsLoading && (
            <div style={{ color: 'var(--color-text-secondary)', padding: '16px 0' }}>
              Loading stock count items...
            </div>
          )}

          {!itemsLoading && items.length > 0 && (
            <div className="fm-table-wrap">
              <table className="fm-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: '320px' }}>Drug details</th>
                    <th>System qty</th>
                    <th>Counted qty</th>
                    <th>Variance</th>
                    <th>Status</th>
                    <th>Save</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td style={{ whiteSpace: 'normal' }}>
                        <div
                          style={{
                            fontWeight: 'var(--font-medium)',
                            color: 'var(--color-text-primary)',
                            marginBottom: '4px',
                          }}
                        >
                          {item.brand_name || '-'}
                        </div>
                        <div
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-text-secondary)',
                            lineHeight: 1.5,
                          }}
                        >
                          {item.generic_name || '-'} · {item.strength || '-'}
                        </div>
                        <div
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-text-tertiary)',
                            marginTop: '2px',
                            lineHeight: 1.5,
                          }}
                        >
                          Code: {item.drug_code || '-'} · Batch:{' '}
                          {item.batch_number || '-'} · Expiry:{' '}
                          {item.expiry_date || '-'}
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontWeight: 'var(--font-medium)',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          {item.system_quantity}
                        </span>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={item.counted_quantity ?? ''}
                          onChange={(e) =>
                            updateLocalCount(item.id, e.target.value)
                          }
                          style={{
                            width: '80px',
                            padding: '6px 8px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-border-default)',
                            background: 'var(--color-bg-input)',
                            color: 'var(--color-text-primary)',
                            fontSize: 'var(--text-base)',
                            fontFamily: 'var(--font-sans)',
                          }}
                        />
                      </td>
                      <td>
                        <VarianceValue value={item.variance} />
                      </td>
                      <td>
                        <ItemStatusBadge status={item.status || 'PENDING'} />
                      </td>
                      <td>
                        {item.status === 'MATCHED' ? (
                          <span
                            style={{
                              color: 'var(--color-success)',
                              fontWeight: 'var(--font-medium)',
                              fontSize: 'var(--text-sm)',
                            }}
                          >
                            ✓ Saved
                          </span>
                        ) : (
                          <button
                            onClick={() => saveCount(item)}
                            disabled={savingItemId === item.id}
                            className="fm-btn fm-btn-primary"
                            style={{
                              fontSize: 'var(--text-xs)',
                              padding: '4px 12px',
                              opacity: savingItemId === item.id ? 0.6 : 1,
                            }}
                          >
                            {savingItemId === item.id ? 'Saving...' : 'Save'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CountKpiCard({ label, value, color, barColor }) {
  return (
    <div className="fm-kpi-card">
      <div className="fm-kpi-label">{label}</div>
      <div className="fm-kpi-value" style={{ color }}>
        {Number(value || 0).toLocaleString()}
      </div>
      <div className="fm-kpi-bar">
        <div
          className="fm-kpi-bar-fill"
          style={{ width: '60%', background: barColor }}
        />
      </div>
    </div>
  )
}

function SessionStatusBadge({ status }) {
  const map = {
    COMPLETED: {
      color: 'var(--color-success)',
      background: 'rgba(29,158,117,0.12)',
      border: '1px solid rgba(29,158,117,0.30)',
    },
    IN_PROGRESS: {
      color: 'var(--color-text-accent)',
      background: 'rgba(24,95,165,0.12)',
      border: '1px solid rgba(24,95,165,0.30)',
    },
    PENDING: {
      color: 'var(--color-warning-mid)',
      background: 'rgba(186,117,23,0.12)',
      border: '1px solid rgba(186,117,23,0.30)',
    },
  }

  const style = map[status] ?? {
    color: 'var(--color-text-secondary)',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--color-border-default)',
  }

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--font-medium)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {status || 'UNKNOWN'}
    </span>
  )
}

function ItemStatusBadge({ status }) {
  const map = {
    MATCHED: {
      color: 'var(--color-success)',
      background: 'rgba(29,158,117,0.12)',
      border: '1px solid rgba(29,158,117,0.30)',
    },
    VARIANCE: {
      color: 'var(--color-danger-mid)',
      background: 'rgba(163,45,45,0.12)',
      border: '1px solid rgba(163,45,45,0.30)',
    },
    PENDING: {
      color: 'var(--color-warning-mid)',
      background: 'rgba(186,117,23,0.12)',
      border: '1px solid rgba(186,117,23,0.30)',
    },
    RECONCILED: {
      color: '#c084fc',
      background: 'rgba(168,85,247,0.12)',
      border: '1px solid rgba(168,85,247,0.30)',
    },
  }

  const style = map[status] ?? map.PENDING

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--font-medium)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {status}
    </span>
  )
}

function VarianceValue({ value }) {
  if (value === null || value === undefined || value === '') {
    return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
  }

  const n = Number(value)

  if (n === 0) {
    return (
      <span
        style={{
          color: 'var(--color-success)',
          fontWeight: 'var(--font-medium)',
        }}
      >
        0
      </span>
    )
  }

  if (n > 0) {
    return (
      <span
        style={{
          color: 'var(--color-warning-mid)',
          fontWeight: 'var(--font-medium)',
        }}
      >
        +{n}
      </span>
    )
  }

  return (
    <span
      style={{
        color: 'var(--color-danger-mid)',
        fontWeight: 'var(--font-medium)',
      }}
    >
      {n}
    </span>
  )
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}
