import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const REASONS = [
  'COUNTING_ERROR',
  'DISPENSING_NOT_RECORDED',
  'TRANSFER_NOT_RECORDED',
  'DAMAGED_STOCK',
  'EXPIRED_STOCK',
  'SYSTEM_ERROR',
  'OTHER',
]

export default function ReconciliationCasesPage() {
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCase, setSelectedCase] = useState(null)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadCases()
  }, [])

  async function loadCases() {
    setLoading(true)

    const { data, error } = await supabase
      .from('reconciliation_cases')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      alert(`Failed to load reconciliation cases: ${error.message}`)
      setCases([])
      setLoading(false)
      return
    }

    setCases(data || [])
    setLoading(false)
  }

  function openCase(caseItem) {
    setSelectedCase(caseItem)
    setReason(caseItem.reason || '')
    setNotes(caseItem.notes || '')
  }

  async function saveInvestigation() {
    if (!selectedCase) return

    if (!reason) {
      alert('Please select a variance reason.')
      return
    }

    setSaving(true)

    const previousStatus = selectedCase.status || 'PENDING'
    const newStatus = 'UNDER_REVIEW'

    const { error: updateError } = await supabase
      .from('reconciliation_cases')
      .update({
        reason,
        notes,
        status: newStatus,
      })
      .eq('id', selectedCase.id)

    if (updateError) {
      console.error(updateError)
      alert(`Failed to save investigation: ${updateError.message}`)
      setSaving(false)
      return
    }

    const { error: auditError } = await supabase
      .from('reconciliation_audit_trail')
      .insert({
        reconciliation_case_id: selectedCase.id,
        action: 'INVESTIGATION_SAVED',
        previous_status: previousStatus,
        new_status: newStatus,
        previous_quantity: selectedCase.system_quantity,
        new_quantity: selectedCase.counted_quantity,
        reason,
        notes,
        approval_status: 'UNDER_REVIEW',
        performed_by: 'system',
      })

    if (auditError) {
      console.error(auditError)
      alert(`Investigation saved, but audit failed: ${auditError.message}`)
      setSaving(false)
      return
    }

    alert('Investigation saved successfully.')

    setSelectedCase(null)
    setReason('')
    setNotes('')
    setSaving(false)
    await loadCases()
  }

  async function approveCase() {
    if (!selectedCase) return

    const previousStatus = selectedCase.status || 'UNDER_REVIEW'

    const { error: updateError } = await supabase
      .from('reconciliation_cases')
      .update({
        status: 'APPROVED',
      })
      .eq('id', selectedCase.id)

    if (updateError) {
      console.error(updateError)
      alert(`Failed to approve case: ${updateError.message}`)
      return
    }

    const { error: auditError } = await supabase
      .from('reconciliation_audit_trail')
      .insert({
        reconciliation_case_id: selectedCase.id,
        action: 'CASE_APPROVED',
        previous_status: previousStatus,
        new_status: 'APPROVED',
        previous_quantity: selectedCase.system_quantity,
        new_quantity: selectedCase.counted_quantity,
        reason: selectedCase.reason || reason || null,
        notes: selectedCase.notes || notes || null,
        approval_status: 'APPROVED',
        performed_by: 'system',
      })

    if (auditError) {
      console.error(auditError)
      alert(`Case approved, but audit failed: ${auditError.message}`)
      return
    }

    alert('Case approved successfully.')

    setSelectedCase(null)
    await loadCases()
  }

  async function rejectCase() {
    if (!selectedCase) return

    const previousStatus = selectedCase.status || 'UNDER_REVIEW'

    const { error: updateError } = await supabase
      .from('reconciliation_cases')
      .update({
        status: 'REJECTED',
      })
      .eq('id', selectedCase.id)

    if (updateError) {
      console.error(updateError)
      alert(`Failed to reject case: ${updateError.message}`)
      return
    }

    const { error: auditError } = await supabase
      .from('reconciliation_audit_trail')
      .insert({
        reconciliation_case_id: selectedCase.id,
        action: 'CASE_REJECTED',
        previous_status: previousStatus,
        new_status: 'REJECTED',
        previous_quantity: selectedCase.system_quantity,
        new_quantity: selectedCase.counted_quantity,
        reason: selectedCase.reason || reason || null,
        notes: selectedCase.notes || notes || null,
        approval_status: 'REJECTED',
        performed_by: 'system',
      })

    if (auditError) {
      console.error(auditError)
      alert(`Case rejected, but audit failed: ${auditError.message}`)
      return
    }

    alert('Case rejected successfully.')

    setSelectedCase(null)
    await loadCases()
  }

  return (
    <div style={pageStyle}>
      <h1>Reconciliation Cases</h1>
      <p style={subtitleStyle}>
        Investigate stock count variances and track reconciliation status.
      </p>

      {loading && <p>Loading reconciliation cases...</p>}

      {!loading && cases.length === 0 && (
        <div style={emptyStyle}>No reconciliation cases found.</div>
      )}

      {!loading && cases.length > 0 && (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Drug Code</th>
              <th style={thStyle}>Batch</th>
              <th style={thStyle}>Expiry</th>
              <th style={thStyle}>System Qty</th>
              <th style={thStyle}>Counted Qty</th>
              <th style={thStyle}>Variance</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Reason</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Created</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>

          <tbody>
            {cases.map((caseItem) => (
              <tr key={caseItem.id}>
                <td style={tdStyle}>{caseItem.drug_code || '-'}</td>
                <td style={tdStyle}>{caseItem.batch_number || '-'}</td>
                <td style={tdStyle}>{caseItem.expiry_date || '-'}</td>
                <td style={tdStyle}>{caseItem.system_quantity}</td>
                <td style={tdStyle}>{caseItem.counted_quantity}</td>
                <td style={tdStyle}>
                  <VarianceValue value={caseItem.variance} />
                </td>
                <td style={tdStyle}>{caseItem.variance_type || '-'}</td>
                <td style={tdStyle}>{caseItem.reason || 'Not assigned'}</td>
                <td style={tdStyle}>
                  <StatusBadge status={caseItem.status} />
                </td>
                <td style={tdStyle}>{formatDate(caseItem.created_at)}</td>
                <td style={tdStyle}>
                  <button onClick={() => openCase(caseItem)} style={buttonStyle}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedCase && (
        <div style={caseDetailsStyle}>
          <h2>Investigate Case</h2>

          <div style={caseGridStyle}>
            <InfoItem label="Drug Code" value={selectedCase.drug_code} />
            <InfoItem label="Batch" value={selectedCase.batch_number} />
            <InfoItem label="Expiry" value={selectedCase.expiry_date} />
            <InfoItem label="System Qty" value={selectedCase.system_quantity} />
            <InfoItem label="Counted Qty" value={selectedCase.counted_quantity} />
            <InfoItem label="Variance" value={selectedCase.variance} />
            <InfoItem label="Status" value={selectedCase.status} />
          </div>

          <label style={labelStyle}>Reason</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={selectStyle}
          >
            <option value="">Select reason...</option>
            {REASONS.map((reasonItem) => (
              <option key={reasonItem} value={reasonItem}>
                {reasonItem}
              </option>
            ))}
          </select>

          <label style={labelStyle}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Enter investigation notes..."
            style={textareaStyle}
          />

          <div style={actionRowStyle}>
            <button
              onClick={saveInvestigation}
              disabled={saving}
              style={{
                ...buttonStyle,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save Investigation'}
            </button>

            <button onClick={approveCase} style={approveButtonStyle}>
              Approve
            </button>

            <button onClick={rejectCase} style={rejectButtonStyle}>
              Reject
            </button>

            <button
              onClick={() => setSelectedCase(null)}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoItem({ label, value }) {
  return (
    <div style={infoItemStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value || '-'}</div>
    </div>
  )
}

function VarianceValue({ value }) {
  const numberValue = Number(value || 0)

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

function StatusBadge({ status }) {
  const finalStatus = status || 'PENDING'

  const styleMap = {
    PENDING: {
      color: '#facc15',
      background: 'rgba(250, 204, 21, 0.12)',
      border: '1px solid rgba(250, 204, 21, 0.4)',
    },
    UNDER_REVIEW: {
      color: '#38bdf8',
      background: 'rgba(56, 189, 248, 0.12)',
      border: '1px solid rgba(56, 189, 248, 0.4)',
    },
    APPROVED: {
      color: '#22c55e',
      background: 'rgba(34, 197, 94, 0.12)',
      border: '1px solid rgba(34, 197, 94, 0.4)',
    },
    CLOSED: {
      color: '#a855f7',
      background: 'rgba(168, 85, 247, 0.12)',
      border: '1px solid rgba(168, 85, 247, 0.4)',
    },
    REJECTED: {
      color: '#ef4444',
      background: 'rgba(239, 68, 68, 0.12)',
      border: '1px solid rgba(239, 68, 68, 0.4)',
    },
  }

  return (
    <span style={{ ...badgeStyle, ...(styleMap[finalStatus] || styleMap.PENDING) }}>
      {finalStatus}
    </span>
  )
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

const subtitleStyle = {
  color: '#94a3b8',
  marginTop: '-8px',
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

const buttonStyle = {
  background: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  padding: '8px 14px',
  cursor: 'pointer',
  fontWeight: 700,
}

const approveButtonStyle = {
  background: '#16a34a',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  padding: '8px 14px',
  cursor: 'pointer',
  fontWeight: 700,
}

const rejectButtonStyle = {
  background: '#dc2626',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  padding: '8px 14px',
  cursor: 'pointer',
  fontWeight: 700,
}

const secondaryButtonStyle = {
  background: '#334155',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  padding: '8px 14px',
  cursor: 'pointer',
  fontWeight: 700,
}

const badgeStyle = {
  display: 'inline-block',
  padding: '5px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
}

const emptyStyle = {
  marginTop: '20px',
  padding: '20px',
  background: '#020617',
  borderRadius: '12px',
  border: '1px solid #334155',
}

const caseDetailsStyle = {
  marginTop: '28px',
  padding: '24px',
  background: '#020617',
  borderRadius: '18px',
  border: '1px solid #334155',
}

const caseGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))',
  gap: '12px',
  marginBottom: '20px',
}

const infoItemStyle = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '12px',
  padding: '12px',
}

const infoLabelStyle = {
  color: '#94a3b8',
  fontSize: '13px',
  marginBottom: '6px',
}

const infoValueStyle = {
  color: 'white',
  fontWeight: 700,
}

const labelStyle = {
  display: 'block',
  marginTop: '14px',
  marginBottom: '8px',
  color: '#cbd5e1',
  fontWeight: 700,
}

const selectStyle = {
  width: '100%',
  padding: '12px',
  borderRadius: '10px',
  border: '1px solid #334155',
  background: '#020617',
  color: 'white',
  marginBottom: '12px',
}

const textareaStyle = {
  width: '100%',
  minHeight: '100px',
  padding: '12px',
  borderRadius: '10px',
  border: '1px solid #334155',
  background: '#020617',
  color: 'white',
  resize: 'vertical',
}

const actionRowStyle = {
  display: 'flex',
  gap: '12px',
  marginTop: '16px',
}