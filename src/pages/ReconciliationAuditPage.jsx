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

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Reconciliation Audit Trail</h1>
          <p style={subtitleStyle}>
            Full history of reconciliation actions, investigations, approvals, and rejections.
          </p>
        </div>

        <button onClick={loadAuditTrail} style={buttonStyle}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={cardStyle}>Loading audit trail...</div>
      ) : auditRows.length === 0 ? (
        <div style={cardStyle}>No audit records found.</div>
      ) : (
        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Case ID</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Previous Status</th>
                <th style={thStyle}>New Status</th>
                <th style={thStyle}>Previous Quantity</th>
                <th style={thStyle}>New Quantity</th>
                <th style={thStyle}>Reason</th>
                <th style={thStyle}>Approval Status</th>
                <th style={thStyle}>Performed By</th>
              </tr>
            </thead>

            <tbody>
              {auditRows.map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>{formatDate(row.created_at)}</td>
                  <td style={tdStyle}>{row.reconciliation_case_id ? row.reconciliation_case_id.substring(0, 8) : '-'}</td>
                  <td style={tdStyle}>{row.action || '-'}</td>
                  <td style={tdStyle}>{row.previous_status || '-'}</td>
                  <td style={tdStyle}>{row.new_status || '-'}</td>
                  <td style={tdStyle}>{formatValue(row.previous_quantity)}</td>
                  <td style={tdStyle}>{formatValue(row.new_quantity)}</td>
                  <td style={tdStyle}>{row.reason || '-'}</td>
                  <td style={tdStyle}>{row.approval_status || '-'}</td>
                  <td style={tdStyle}>{row.performed_by || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  return value
}

const pageStyle = {
  minHeight: '100vh',
  background: '#0f172a',
  color: '#e5e7eb',
  padding: '24px',
}

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '20px',
  gap: '16px',
}

const titleStyle = {
  margin: 0,
  fontSize: '28px',
  fontWeight: '700',
}

const subtitleStyle = {
  marginTop: '8px',
  color: '#94a3b8',
}

const buttonStyle = {
  background: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  padding: '10px 16px',
  cursor: 'pointer',
  fontWeight: '600',
}

const cardStyle = {
  background: '#111827',
  border: '1px solid #1f2937',
  borderRadius: '12px',
  padding: '20px',
  color: '#cbd5e1',
}

const tableWrapperStyle = {
  overflowX: 'auto',
  background: '#111827',
  border: '1px solid #1f2937',
  borderRadius: '12px',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '1200px',
}

const thStyle = {
  textAlign: 'left',
  padding: '12px',
  background: '#1e293b',
  color: '#cbd5e1',
  fontSize: '13px',
  borderBottom: '1px solid #334155',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '12px',
  borderBottom: '1px solid #1f2937',
  fontSize: '13px',
  color: '#e5e7eb',
  verticalAlign: 'top',
}