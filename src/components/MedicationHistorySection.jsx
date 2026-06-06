import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function MedicationHistorySection({ patient, refreshKey = 0 }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (patient?.id) {
      loadHistory()
    }
  }, [patient?.id, refreshKey])

  async function loadHistory() {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('patient_medication_history')
      .select('*')
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(`Error loading medication history: ${error.message}`)
      setHistory([])
      setLoading(false)
      return
    }

    setHistory(data || [])
    setLoading(false)
  }

  return (
    <div style={sectionStyle}>
      <h3>Medication History</h3>

      {loading && <div style={mutedStyle}>Loading medication history...</div>}

      {message && <div style={errorStyle}>{message}</div>}

      {!loading && history.length === 0 && (
        <div style={emptyStyle}>No medication history yet.</div>
      )}

      {history.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Brand</th>
                <th style={thStyle}>Generic</th>
                <th style={thStyle}>Strength</th>
                <th style={thStyle}>Form</th>
                <th style={thStyle}>Qty</th>
                <th style={thStyle}>Directions</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>Doctor</th>
                <th style={thStyle}>Indication</th>
              </tr>
            </thead>

            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td style={tdStyle}>
                    {item.created_at
                      ? new Date(item.created_at).toLocaleString()
                      : '-'}
                  </td>
                  <td style={tdStyle}>{item.brand_name || '-'}</td>
                  <td style={tdStyle}>{item.generic_name || '-'}</td>
                  <td style={tdStyle}>{item.strength || '-'}</td>
                  <td style={tdStyle}>{item.dosage_form || '-'}</td>
                  <td style={tdStyle}>{item.quantity || '-'}</td>
                  <td style={tdStyle}>{item.directions || '-'}</td>
                  <td style={tdStyle}>
                    {item.duration_days ? `${item.duration_days} days` : '-'}
                  </td>
                  <td style={tdStyle}>{item.prescribing_doctor || '-'}</td>
                  <td style={tdStyle}>{item.indication || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const sectionStyle = {
  background: '#020617',
  border: '1px solid #334155',
  borderRadius: '14px',
  padding: '18px',
  marginTop: '18px',
}

const mutedStyle = {
  color: '#94a3b8',
}

const errorStyle = {
  color: '#fca5a5',
}

const emptyStyle = {
  color: '#94a3b8',
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '10px',
  padding: '12px',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: '12px',
  background: '#0f172a',
}

const thStyle = {
  textAlign: 'left',
  padding: '10px',
  color: 'white',
  borderBottom: '1px solid #334155',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '10px',
  color: '#cbd5e1',
  borderBottom: '1px solid #1e293b',
  whiteSpace: 'nowrap',
}