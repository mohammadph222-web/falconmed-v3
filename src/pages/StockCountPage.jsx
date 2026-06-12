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
  const pending = items.filter((item) => !item.status || item.status === 'PENDING').length
  const reconciled = items.filter((item) => item.status === 'RECONCILED').length

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
      .update({
        counted_quantity: counted,
        variance,
        status,
      })
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
          ? {
              ...currentItem,
              counted_quantity: counted,
              variance,
              status,
            }
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
alert(`Existing error: ${JSON.stringify(existingError)}`)
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
    alert('Reconciliation cases already exist for all active variance items.')
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
      alert(`Cases were created, but audit trail failed: ${auditError.message}`)
      setReconcilingSessionId(null)
      return
    }
  }

  alert(`Reconciliation generated successfully.\n\nNew cases created: ${newCaseRows.length}`)

  setReconcilingSessionId(null)
}
   
  return (
    <div style={pageStyle}>
      <h1>Stock Count Sessions</h1>

      {loading && <p>Loading sessions...</p>}

      {!loading && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Session Name</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Started</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>

          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td style={tdStyle}>{session.session_name}</td>
                <td style={tdStyle}>
                  <StatusBadge status={session.status} />
                </td>
                <td style={tdStyle}>{formatDate(session.started_at)}</td>
                <td style={tdStyle}>
                  <div style={actionGroupStyle}>
                    <button onClick={() => openSession(session)} style={buttonStyle}>
                      Open
                    </button>

                    {session.status === 'COMPLETED' && (
                      <button
                        onClick={() => generateReconciliationCases(session)}
                        disabled={reconcilingSessionId === session.id}
                        style={{
                          ...reconcileButtonStyle,
                          opacity: reconcilingSessionId === session.id ? 0.6 : 1,
                        }}
                      >
                        {reconcilingSessionId === session.id
                          ? 'Generating...'
                          : 'Generate Reconciliation'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && sessions.length === 0 && (
        <div style={emptyStyle}>No stock count sessions found</div>
      )}

      {selectedSession && (
        <div style={detailsStyle}>
          <h2>{selectedSession.session_name}</h2>

          <p style={{ color: '#94a3b8' }}>
            Status: {selectedSession.status} | Items: {items.length}
          </p>

          <div style={statsGridStyle}>
  <StatCard label="Total Items" value={stats.total} />
  <StatCard label="Matched" value={stats.matched} tone="green" />
  <StatCard label="Pending" value={stats.pending} tone="yellow" />
  <StatCard label="Variance" value={stats.variance} tone="red" />
  <StatCard label="Reconciled" value={stats.reconciled} tone="purple" />
</div>

          {itemsLoading && <p>Loading stock count items...</p>}

          {!itemsLoading && (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Drug Details</th>
                  <th style={thStyle}>System Qty</th>
                  <th style={thStyle}>Counted Qty</th>
                  <th style={thStyle}>Variance</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Save</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={drugTdStyle}>
                      <div style={brandStyle}>{item.brand_name || '-'}</div>

                      <div style={subTextStyle}>
                        {item.generic_name || '-'} | {item.strength || '-'}
                      </div>

                      <div style={subTextStyle}>
                        Code: {item.drug_code || '-'} | Pack:{' '}
                        {item.package_size || '-'}
                      </div>

                      <div style={subTextStyle}>
                        Batch: {item.batch_number || '-'} | Expiry:{' '}
                        {item.expiry_date || '-'}
                      </div>
                    </td>

                    <td style={tdStyle}>{item.system_quantity}</td>

                    <td style={tdStyle}>
                      <input
                        type="number"
                        value={item.counted_quantity ?? ''}
                        onChange={(e) => updateLocalCount(item.id, e.target.value)}
                        style={inputStyle}
                      />
                    </td>

                    <td style={tdStyle}>
                      <VarianceValue value={item.variance} />
                    </td>

                    <td style={tdStyle}>
                      <StatusBadge status={item.status || 'PENDING'} />
                    </td>

                    <td style={tdStyle}>
                      {item.status === 'MATCHED' ? (
                        <span style={savedStyle}>✓ Saved</span>
                      ) : (
                        <button
                          onClick={() => saveCount(item)}
                          disabled={savingItemId === item.id}
                          style={{
                            ...buttonStyle,
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
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, tone = 'blue' }) {
  const colors = {
  blue: '#38bdf8',
  green: '#22c55e',
  yellow: '#facc15',
  red: '#ef4444',
  purple: '#a855f7',
}

  return (
    <div style={statCardStyle}>
      <div style={{ color: '#94a3b8', fontSize: '13px' }}>{label}</div>
      <div style={{ color: colors[tone], fontSize: '28px', fontWeight: 800 }}>
        {value}
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const finalStatus = status || 'PENDING'

  const styleMap = {
    MATCHED: {
      color: '#22c55e',
      background: 'rgba(34, 197, 94, 0.12)',
      border: '1px solid rgba(34, 197, 94, 0.4)',
    },
    VARIANCE: {
      color: '#ef4444',
      background: 'rgba(239, 68, 68, 0.12)',
      border: '1px solid rgba(239, 68, 68, 0.4)',
    },
    PENDING: {
      color: '#facc15',
      background: 'rgba(250, 204, 21, 0.12)',
      border: '1px solid rgba(250, 204, 21, 0.4)',
    },
    COMPLETED: {
      color: '#22c55e',
      background: 'rgba(34, 197, 94, 0.12)',
      border: '1px solid rgba(34, 197, 94, 0.4)',
    },
  }

  return (
    <span
      style={{
        ...badgeStyle,
        ...(styleMap[finalStatus] || styleMap.PENDING),
      }}
    >
      {finalStatus}
    </span>
  )
}

function VarianceValue({ value }) {
  if (value === null || value === undefined || value === '') {
    return <span style={{ color: '#94a3b8' }}>-</span>
  }

  const numberValue = Number(value)

  if (numberValue === 0) {
    return <span style={{ color: '#22c55e', fontWeight: 700 }}>0</span>
  }

  if (numberValue > 0) {
    return (
      <span style={{ color: '#facc15', fontWeight: 700 }}>
        +{numberValue}
      </span>
    )
  }

  return <span style={{ color: '#ef4444', fontWeight: 700 }}>{numberValue}</span>
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

const pageStyle = {
  background: '#0f172a',
  padding: '30px',
  borderRadius: '20px',
  color: 'white',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: '20px',
}

const thStyle = {
  borderBottom: '1px solid #334155',
  padding: '12px',
  textAlign: 'left',
  color: 'white',
}

const tdStyle = {
  padding: '12px',
  borderBottom: '1px solid #1e293b',
  color: '#cbd5e1',
  verticalAlign: 'top',
}

const drugTdStyle = {
  ...tdStyle,
  minWidth: '420px',
}

const brandStyle = {
  fontWeight: 700,
  color: 'white',
  marginBottom: '6px',
}

const subTextStyle = {
  fontSize: '13px',
  color: '#94a3b8',
  marginTop: '4px',
}

const buttonStyle = {
  background: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  padding: '8px 14px',
  cursor: 'pointer',
}

const reconcileButtonStyle = {
  background: '#7c3aed',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  padding: '8px 14px',
  cursor: 'pointer',
}

const actionGroupStyle = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap',
}

const inputStyle = {
  width: '90px',
  padding: '8px',
  borderRadius: '8px',
  border: '1px solid #334155',
  background: '#020617',
  color: 'white',
}

const detailsStyle = {
  marginTop: '30px',
  padding: '24px',
  background: '#020617',
  borderRadius: '18px',
  border: '1px solid #334155',
}

const emptyStyle = {
  marginTop: '20px',
  padding: '20px',
  background: '#020617',
  borderRadius: '12px',
}

const statsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(130px, 1fr))',
  gap: '12px',
  marginTop: '18px',
  marginBottom: '20px',
}
const statCardStyle = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '14px',
  padding: '16px',
}

const badgeStyle = {
  display: 'inline-block',
  padding: '5px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
}

const savedStyle = {
  color: '#22c55e',
  fontWeight: 700,
}