import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ReconciliationAuditPage() {
  const [auditRows, setAuditRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAuditTrail()
  }, [])

  async function loadAuditTrail() {
    setLoading(true)

    const { data, error } = await supabase
      .from('reconciliation_audit_trail')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Audit trail load error:', error)
      setAuditRows([])
      setLoading(false)
      return
    }

    setAuditRows(data || [])
    setLoading(false)
  }

  const savedCount = auditRows.filter(
    (r) => r.action === 'INVESTIGATION_SAVED'
  ).length
  const approvedCount = auditRows.filter(
    (r) => r.action === 'CASE_APPROVED'
  ).length
  const rejectedCount = auditRows.filter(
    (r) => r.action === 'CASE_REJECTED'
  ).length

  return (
    <div>
      <div className="fm-page-header">
        <div className="fm-page-header-top">
          <div>
            <div className="fm-page-header-meta">Governance</div>
            <h1 className="fm-page-header-title">Reconciliation audit trail</h1>
            <p className="fm-page-header-desc">
              Full history of reconciliation actions, investigations,
              approvals, and rejections.
            </p>
          </div>
          <div className="fm-page-header-actions">
            <button className="fm-btn" onClick={loadAuditTrail}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {!loading && auditRows.length > 0 && (
        <div className="fm-grid-kpi" style={{ marginBottom: '24px' }}>
          <AuditKpiCard
            label="Total audit records"
            value={auditRows.length}
            color="var(--color-text-accent)"
            barColor="var(--color-primary)"
          />
          <AuditKpiCard
            label="Investigations saved"
            value={savedCount}
            color="var(--color-warning-mid)"
            barColor="var(--color-warning-mid)"
          />
          <AuditKpiCard
            label="Cases approved"
            value={approvedCount}
            color="var(--color-success)"
            barColor="var(--color-success)"
          />
          <AuditKpiCard
            label="Cases rejected"
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
          Loading audit trail...
        </div>
      )}

      {!loading && auditRows.length === 0 && (
        <div className="fm-empty-state">
          <div className="fm-empty-state-title">No audit records found</div>
          <div className="fm-empty-state-desc">
            Audit records are created automatically when reconciliation
            cases are investigated, approved, or rejected.
          </div>
        </div>
      )}

      {!loading && auditRows.length > 0 && (
        <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="fm-table-wrap">
            <table className="fm-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Case ID</th>
                  <th>Action</th>
                  <th>Previous status</th>
                  <th>New status</th>
                  <th>Previous qty</th>
                  <th>New qty</th>
                  <th>Reason</th>
                  <th>Approval status</th>
                  <th>Performed by</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => (
                  <tr key={row.id}>
                    <td className="fm-table-muted" style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(row.created_at)}
                    </td>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-accent)',
                        }}
                      >
                        {row.reconciliation_case_id
                          ? row.reconciliation_case_id.substring(0, 8)
                          : '-'}
                      </span>
                    </td>
                    <td>
                      <ActionBadge action={row.action} />
                    </td>
                    <td className="fm-table-muted">
                      {row.previous_status || '-'}
                    </td>
                    <td>
                      <StatusBadge status={row.new_status} />
                    </td>
                    <td className="fm-table-muted">
                      {formatValue(row.previous_quantity)}
                    </td>
                    <td className="fm-table-muted">
                      {formatValue(row.new_quantity)}
                    </td>
                    <td className="fm-table-muted">
                      {row.reason || (
                        <span style={{ color: 'var(--color-text-tertiary)' }}>
                          —
                        </span>
                      )}
                    </td>
                    <td>
                      <ApprovalBadge status={row.approval_status} />
                    </td>
                    <td className="fm-table-muted">
                      {row.performed_by || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function AuditKpiCard({ label, value, color, barColor }) {
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

function ActionBadge({ action }) {
  const map = {
    INVESTIGATION_SAVED: {
      color: 'var(--color-warning-mid)',
      background: 'rgba(186,117,23,0.12)',
      border: '1px solid rgba(186,117,23,0.30)',
      label: 'Investigation saved',
    },
    CASE_APPROVED: {
      color: 'var(--color-success)',
      background: 'rgba(29,158,117,0.12)',
      border: '1px solid rgba(29,158,117,0.30)',
      label: 'Case approved',
    },
    CASE_REJECTED: {
      color: 'var(--color-danger-mid)',
      background: 'rgba(163,45,45,0.12)',
      border: '1px solid rgba(163,45,45,0.30)',
      label: 'Case rejected',
    },
  }

  const style = map[action] ?? {
    color: 'var(--color-text-secondary)',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--color-border-default)',
    label: action || '-',
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
        color: style.color,
        background: style.background,
        border: style.border,
      }}
    >
      {style.label}
    </span>
  )
}

function StatusBadge({ status }) {
  const map = {
    PENDING: {
      color: 'var(--color-warning-mid)',
      background: 'rgba(186,117,23,0.12)',
      border: '1px solid rgba(186,117,23,0.30)',
    },
    UNDER_REVIEW: {
      color: 'var(--color-text-accent)',
      background: 'rgba(24,95,165,0.12)',
      border: '1px solid rgba(24,95,165,0.30)',
    },
    APPROVED: {
      color: 'var(--color-success)',
      background: 'rgba(29,158,117,0.12)',
      border: '1px solid rgba(29,158,117,0.30)',
    },
    REJECTED: {
      color: 'var(--color-danger-mid)',
      background: 'rgba(163,45,45,0.12)',
      border: '1px solid rgba(163,45,45,0.30)',
    },
    CLOSED: {
      color: '#c084fc',
      background: 'rgba(168,85,247,0.12)',
      border: '1px solid rgba(168,85,247,0.30)',
    },
  }

  if (!status) {
    return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
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
      {status}
    </span>
  )
}

function ApprovalBadge({ status }) {
  return <StatusBadge status={status} />
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  return value
}