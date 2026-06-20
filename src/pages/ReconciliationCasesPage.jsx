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
      .update({ reason, notes, status: newStatus })
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
      .update({ status: 'APPROVED' })
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
      .update({ status: 'REJECTED' })
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

  const pendingCount = cases.filter((c) => c.status === 'PENDING').length
  const underReviewCount = cases.filter((c) => c.status === 'UNDER_REVIEW').length
  const approvedCount = cases.filter((c) => c.status === 'APPROVED').length
  const rejectedCount = cases.filter((c) => c.status === 'REJECTED').length

  return (
    <div>
      <div className="fm-page-header">
        <div className="fm-page-header-top">
          <div>
            <div className="fm-page-header-meta">Governance</div>
            <h1 className="fm-page-header-title">Reconciliation cases</h1>
            <p className="fm-page-header-desc">
              Investigate stock count variances and track reconciliation
              status across all pharmacies.
            </p>
          </div>
          <div className="fm-page-header-actions">
            <button className="fm-btn" onClick={loadCases}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {!loading && cases.length > 0 && (
        <div className="fm-grid-kpi" style={{ marginBottom: '24px' }}>
          <ReconKpiCard
            label="Total cases"
            value={cases.length}
            color="var(--color-text-accent)"
            barColor="var(--color-primary)"
          />
          <ReconKpiCard
            label="Pending"
            value={pendingCount}
            color="var(--color-warning-mid)"
            barColor="var(--color-warning-mid)"
          />
          <ReconKpiCard
            label="Under review"
            value={underReviewCount}
            color="var(--color-text-accent)"
            barColor="var(--color-primary)"
          />
          <ReconKpiCard
            label="Approved"
            value={approvedCount}
            color="var(--color-success)"
            barColor="var(--color-success)"
          />
          <ReconKpiCard
            label="Rejected"
            value={rejectedCount}
            color="var(--color-danger-mid)"
            barColor="var(--color-danger-mid)"
          />
        </div>
      )}

      {loading && (
        <div
          className="fm-card"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Loading reconciliation cases...
        </div>
      )}

      {!loading && cases.length === 0 && (
        <div className="fm-empty-state">
          <div className="fm-empty-state-title">No reconciliation cases</div>
          <div className="fm-empty-state-desc">
            Cases will appear here after a stock count generates variances.
          </div>
        </div>
      )}

      {!loading && cases.length > 0 && (
        <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="fm-table-wrap">
            <table className="fm-table">
              <thead>
                <tr>
                  <th>Drug code</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>System qty</th>
                  <th>Counted qty</th>
                  <th>Variance</th>
                  <th>Type</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((caseItem) => (
                  <tr key={caseItem.id}>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-accent)',
                        }}
                      >
                        {caseItem.drug_code || '-'}
                      </span>
                    </td>
                    <td className="fm-table-muted">
                      {caseItem.batch_number || '-'}
                    </td>
                    <td className="fm-table-muted">
                      {caseItem.expiry_date || '-'}
                    </td>
                    <td>{caseItem.system_quantity}</td>
                    <td>{caseItem.counted_quantity}</td>
                    <td>
                      <VarianceValue value={caseItem.variance} />
                    </td>
                    <td className="fm-table-muted">
                      {caseItem.variance_type || '-'}
                    </td>
                    <td className="fm-table-muted">
                      {caseItem.reason || (
                        <span style={{ color: 'var(--color-text-tertiary)' }}>
                          Not assigned
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={caseItem.status} />
                    </td>
                    <td className="fm-table-muted">
                      {formatDate(caseItem.created_at)}
                    </td>
                    <td>
                      <button
                        onClick={() => openCase(caseItem)}
                        className="fm-btn"
                        style={{ fontSize: 'var(--text-xs)', padding: '4px 10px' }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedCase && (
        <div className="fm-card" style={{ marginTop: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
              paddingBottom: '16px',
              borderBottom: '1px solid var(--color-border-subtle)',
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
                Investigate case
              </h2>
              <p
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-secondary)',
                  margin: '4px 0 0',
                }}
              >
                {selectedCase.drug_code} · Variance:{' '}
                <VarianceValue value={selectedCase.variance} />
              </p>
            </div>
            <StatusBadge status={selectedCase.status} />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '10px',
              marginBottom: '24px',
            }}
          >
            <CaseInfoItem label="Drug code" value={selectedCase.drug_code} />
            <CaseInfoItem label="Batch" value={selectedCase.batch_number} />
            <CaseInfoItem label="Expiry" value={selectedCase.expiry_date} />
            <CaseInfoItem label="System qty" value={selectedCase.system_quantity} />
            <CaseInfoItem label="Counted qty" value={selectedCase.counted_quantity} />
            <CaseInfoItem label="Variance" value={selectedCase.variance} />
            <CaseInfoItem label="Status" value={selectedCase.status} />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--color-text-secondary)',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Variance reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-base)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <option value="">Select reason...</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--color-text-secondary)',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Investigation notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter investigation notes..."
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-base)',
                fontFamily: 'var(--font-sans)',
                resize: 'vertical',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              paddingTop: '16px',
              borderTop: '1px solid var(--color-border-subtle)',
            }}
          >
            <button
              onClick={saveInvestigation}
              disabled={saving}
              className="fm-btn fm-btn-primary"
              style={{ opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Saving...' : 'Save investigation'}
            </button>

            <button
              onClick={approveCase}
              className="fm-btn"
              style={{
                background: 'rgba(29,158,117,0.15)',
                borderColor: 'rgba(29,158,117,0.4)',
                color: 'var(--color-success)',
              }}
            >
              Approve
            </button>

            <button
              onClick={rejectCase}
              className="fm-btn"
              style={{
                background: 'rgba(163,45,45,0.15)',
                borderColor: 'rgba(163,45,45,0.4)',
                color: 'var(--color-danger-mid)',
              }}
            >
              Reject
            </button>

            <button
              onClick={() => setSelectedCase(null)}
              className="fm-btn"
              style={{ marginLeft: 'auto' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ReconKpiCard({ label, value, color, barColor }) {
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

function CaseInfoItem({ label, value }) {
  return (
    <div
      style={{
        background: 'var(--color-bg-content)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
      }}
    >
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '4px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 'var(--text-base)',
          fontWeight: 'var(--font-medium)',
          color: 'var(--color-text-primary)',
        }}
      >
        {value ?? '-'}
      </div>
    </div>
  )
}

function VarianceValue({ value }) {
  const n = Number(value || 0)
  if (n === 0)
    return (
      <span style={{ color: 'var(--color-success)', fontWeight: 'var(--font-medium)' }}>
        0
      </span>
    )
  if (n > 0)
    return (
      <span style={{ color: 'var(--color-warning-mid)', fontWeight: 'var(--font-medium)' }}>
        +{n}
      </span>
    )
  return (
    <span style={{ color: 'var(--color-danger-mid)', fontWeight: 'var(--font-medium)' }}>
      {n}
    </span>
  )
}

function StatusBadge({ status }) {
  const finalStatus = status || 'PENDING'

  const styleMap = {
    PENDING: {
      color: 'var(--color-warning-mid)',
      background: 'rgba(186,117,23,0.12)',
      border: '1px solid rgba(186,117,23,0.35)',
    },
    UNDER_REVIEW: {
      color: 'var(--color-text-accent)',
      background: 'rgba(24,95,165,0.12)',
      border: '1px solid rgba(24,95,165,0.35)',
    },
    APPROVED: {
      color: 'var(--color-success)',
      background: 'rgba(29,158,117,0.12)',
      border: '1px solid rgba(29,158,117,0.35)',
    },
    CLOSED: {
      color: '#c084fc',
      background: 'rgba(168,85,247,0.12)',
      border: '1px solid rgba(168,85,247,0.35)',
    },
    REJECTED: {
      color: 'var(--color-danger-mid)',
      background: 'rgba(163,45,45,0.12)',
      border: '1px solid rgba(163,45,45,0.35)',
    },
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
        ...(styleMap[finalStatus] ?? styleMap.PENDING),
      }}
    >
      {finalStatus}
    </span>
  )
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}