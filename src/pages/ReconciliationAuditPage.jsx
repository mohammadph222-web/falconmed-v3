import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const ACTION_LABELS = {
  INVESTIGATION_SAVED: 'Investigation saved',
  CASE_APPROVED: 'Case approved',
  CASE_REJECTED: 'Case rejected',
  STATUS_CHANGE: 'Status change',
}

const ACTION_FILTERS = [
  { key: 'ALL', label: 'All actions' },
  { key: 'INVESTIGATION_SAVED', label: 'Investigation saved' },
  { key: 'CASE_APPROVED', label: 'Case approved' },
  { key: 'CASE_REJECTED', label: 'Case rejected' },
  { key: 'STATUS_CHANGE', label: 'Status change' },
]

const STATUS_FILTERS = [
  { key: 'ALL', label: 'All statuses' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'UNDER_REVIEW', label: 'Under review' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'PENDING', label: 'Pending' },
]

export default function ReconciliationAuditPage() {
  const [auditRows, setAuditRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [selectedRow, setSelectedRow] = useState(null)

  useEffect(() => {
    loadAuditTrail()
  }, [])

  async function loadAuditTrail() {
    setLoading(true)
    setSelectedRow(null)

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

  const totalCount = auditRows.length
  const savedCount = auditRows.filter(
    (r) => r.action === 'INVESTIGATION_SAVED'
  ).length
  const approvedCount = auditRows.filter(
    (r) => r.action === 'CASE_APPROVED' || r.approval_status === 'APPROVED'
  ).length
  const rejectedCount = auditRows.filter(
    (r) => r.action === 'CASE_REJECTED' || r.approval_status === 'REJECTED'
  ).length

  const filteredRows = auditRows.filter((row) => {
    const matchesAction =
      actionFilter === 'ALL' || row.action === actionFilter

    const matchesStatus =
      statusFilter === 'ALL' ||
      row.new_status === statusFilter ||
      row.approval_status === statusFilter

    const term = searchTerm.toLowerCase().trim()
    const matchesSearch =
      !term ||
      (row.reconciliation_case_id || '').toLowerCase().includes(term) ||
      (row.reason || '').toLowerCase().includes(term) ||
      (row.performed_by || '').toLowerCase().includes(term) ||
      (row.action || '').toLowerCase().includes(term) ||
      (row.new_status || '').toLowerCase().includes(term)

    return matchesAction && matchesStatus && matchesSearch
  })

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
            value={totalCount}
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

      {!loading && auditRows.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="text"
            placeholder="Search by case ID, reason, performed by..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setSelectedRow(null)
            }}
            style={{
              flex: '1',
              minWidth: '220px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-default)',
              background: 'var(--color-bg-input)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-base)',
              fontFamily: 'var(--font-sans)',
            }}
          />

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {ACTION_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setActionFilter(f.key)
                  setSelectedRow(null)
                }}
                className="fm-filter-pill"
                style={{
                  background:
                    actionFilter === f.key
                      ? 'rgba(24,95,165,0.15)'
                      : 'transparent',
                  borderColor:
                    actionFilter === f.key
                      ? 'var(--color-primary)'
                      : undefined,
                  color:
                    actionFilter === f.key
                      ? 'var(--color-text-accent)'
                      : undefined,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setStatusFilter(f.key)
                  setSelectedRow(null)
                }}
                className="fm-filter-pill"
                style={{
                  background:
                    statusFilter === f.key
                      ? 'rgba(24,95,165,0.15)'
                      : 'transparent',
                  borderColor:
                    statusFilter === f.key
                      ? 'var(--color-primary)'
                      : undefined,
                  color:
                    statusFilter === f.key
                      ? 'var(--color-text-accent)'
                      : undefined,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {(searchTerm || actionFilter !== 'ALL' || statusFilter !== 'ALL') && (
            <button
              className="fm-btn"
              onClick={() => {
                setSearchTerm('')
                setActionFilter('ALL')
                setStatusFilter('ALL')
                setSelectedRow(null)
              }}
              style={{ whiteSpace: 'nowrap' }}
            >
              Clear filters
            </button>
          )}

          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              whiteSpace: 'nowrap',
              marginLeft: 'auto',
            }}
          >
            {filteredRows.length.toLocaleString()} of{' '}
            {totalCount.toLocaleString()} records
          </span>
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
            Audit records are created automatically when reconciliation cases
            are investigated, approved, or rejected.
          </div>
        </div>
      )}

      {!loading && auditRows.length > 0 && filteredRows.length === 0 && (
        <div className="fm-empty-state">
          <div className="fm-empty-state-title">No records match</div>
          <div className="fm-empty-state-desc">
            Try adjusting your search or filter.
          </div>
        </div>
      )}

      {!loading && filteredRows.length > 0 && (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div
            className="fm-card"
            style={{
              padding: 0,
              overflow: 'hidden',
              flex: selectedRow ? '1 1 60%' : '1 1 100%',
              minWidth: 0,
            }}
          >
            <div className="fm-table-wrap">
              <table className="fm-table">
                <thead>
                  <tr>
                    <th style={{ width: '140px' }}>Date</th>
                    <th style={{ width: '90px' }}>Case ID</th>
                    <th style={{ width: '160px' }}>Action</th>
                    <th style={{ width: '120px' }}>Previous status</th>
                    <th style={{ width: '120px' }}>New status</th>
                    <th>Reason</th>
                    <th style={{ width: '120px' }}>Approval</th>
                    <th style={{ width: '140px' }}>Performed by</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() =>
                        setSelectedRow(
                          selectedRow?.id === row.id ? null : row
                        )
                      }
                      style={{
                        cursor: 'pointer',
                        background:
                          selectedRow?.id === row.id
                            ? 'var(--color-bg-card-hover)'
                            : undefined,
                      }}
                    >
                      <td
                        className="fm-table-muted"
                        style={{ fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}
                      >
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
                      <td className="fm-table-muted" style={{ fontSize: 'var(--text-xs)' }}>
                        {row.previous_status || '—'}
                      </td>
                      <td>
                        <StatusBadge status={row.new_status} />
                      </td>
                      <td
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-secondary)',
                          maxWidth: '200px',
                          whiteSpace: 'normal',
                          lineHeight: '1.4',
                        }}
                      >
                        {row.reason || (
                          <span style={{ color: 'var(--color-text-tertiary)' }}>
                            —
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={row.approval_status} />
                      </td>
                      <td
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-secondary)',
                          whiteSpace: 'normal',
                        }}
                      >
                        {row.performed_by || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedRow && (
            <div
              className="fm-card"
              style={{ flex: '0 0 320px', minWidth: '280px' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <h3
                  style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 'var(--font-medium)',
                    color: 'var(--color-text-primary)',
                    margin: 0,
                  }}
                >
                  Audit record
                </h3>
                <button
                  className="fm-btn"
                  style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }}
                  onClick={() => setSelectedRow(null)}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <DetailField
                  label="Case ID"
                  value={
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-accent)',
                      }}
                    >
                      {selectedRow.reconciliation_case_id || '—'}
                    </span>
                  }
                />
                <DetailField label="Date" value={formatDate(selectedRow.created_at)} />
                <DetailField
                  label="Action"
                  value={<ActionBadge action={selectedRow.action} />}
                />
                <DetailField label="Previous status" value={selectedRow.previous_status || '—'} />
                <DetailField
                  label="New status"
                  value={<StatusBadge status={selectedRow.new_status} />}
                />
                <DetailField
                  label="Previous quantity"
                  value={formatValue(selectedRow.previous_quantity)}
                />
                <DetailField
                  label="New quantity"
                  value={formatValue(selectedRow.new_quantity)}
                />
                <DetailField
                  label="Approval status"
                  value={<StatusBadge status={selectedRow.approval_status} />}
                />
                <DetailField
                  label="Performed by"
                  value={selectedRow.performed_by || '—'}
                />
                {selectedRow.reason && (
                  <DetailField label="Reason" value={selectedRow.reason} />
                )}
                {selectedRow.notes && (
                  <DetailField label="Notes" value={selectedRow.notes} />
                )}
              </div>
            </div>
          )}
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

function DetailField({ label, value }) {
  return (
    <div>
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '3px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-primary)',
          lineHeight: '1.4',
        }}
      >
        {value}
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
    },
    CASE_APPROVED: {
      color: 'var(--color-success)',
      background: 'rgba(29,158,117,0.12)',
      border: '1px solid rgba(29,158,117,0.30)',
    },
    CASE_REJECTED: {
      color: 'var(--color-danger-mid)',
      background: 'rgba(163,45,45,0.12)',
      border: '1px solid rgba(163,45,45,0.30)',
    },
    STATUS_CHANGE: {
      color: 'var(--color-text-accent)',
      background: 'rgba(24,95,165,0.12)',
      border: '1px solid rgba(24,95,165,0.30)',
    },
  }

  const style = map[action] ?? {
    color: 'var(--color-text-secondary)',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--color-border-default)',
  }

  const label = ACTION_LABELS[action] ?? action ?? '—'

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
      {label}
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

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  return value
}