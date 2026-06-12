import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function PatientMedicationProfile({ patient, refreshKey = 0 }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (patient?.id) {
      loadProfile()
    }
  }, [patient?.id, refreshKey])

  async function loadProfile() {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('patient_medication_history')
      .select('*')
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(`Error loading medication profile: ${error.message}`)
      setHistory([])
      setLoading(false)
      return
    }

    setHistory(data || [])
    setLoading(false)
  }

  const profile = useMemo(() => {
    const totalDispenses = history.length

    const totalQuantity = history.reduce((sum, item) => {
      return sum + Number(item.quantity || 0)
    }, 0)

    const lastDispenseDate = history[0]?.created_at || null

    const medMap = new Map()

    history.forEach((item) => {
      const key = item.drug_code

      if (!medMap.has(key)) {
        medMap.set(key, {
          drug_code: item.drug_code,
          brand_name: item.brand_name,
          generic_name: item.generic_name,
          strength: item.strength,
          dosage_form: item.dosage_form,
          last_dispense_date: item.created_at,
          total_quantity: Number(item.quantity || 0),
          dispense_count: 1,
        })
      } else {
        const existing = medMap.get(key)
        existing.total_quantity += Number(item.quantity || 0)
        existing.dispense_count += 1
      }
    })

    const currentMedications = Array.from(medMap.values()).slice(0, 10)

    return {
      totalDispenses,
      totalQuantity,
      lastDispenseDate,
      currentMedications,
    }
  }, [history])

  return (
    <div style={sectionStyle}>
      <h3>Medication Profile</h3>

      {loading && <div style={mutedStyle}>Loading medication profile...</div>}
      {message && <div style={errorStyle}>{message}</div>}

      {!loading && history.length === 0 && (
        <div style={emptyStyle}>No medication profile available yet.</div>
      )}

      {history.length > 0 && (
        <>
          <div style={cardsGridStyle}>
            <div style={cardStyle}>
              <div style={cardLabelStyle}>Last Dispense Date</div>
              <div style={cardValueStyle}>
                {profile.lastDispenseDate
                  ? new Date(profile.lastDispenseDate).toLocaleDateString('en-GB')
                  : '-'}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={cardLabelStyle}>Total Dispenses</div>
              <div style={cardValueStyle}>{profile.totalDispenses}</div>
            </div>

            <div style={cardStyle}>
              <div style={cardLabelStyle}>Total Quantity Dispensed</div>
              <div style={cardValueStyle}>{profile.totalQuantity}</div>
            </div>

            <div style={cardStyle}>
              <div style={cardLabelStyle}>Current Medication Count</div>
              <div style={cardValueStyle}>
                {profile.currentMedications.length}
              </div>
            </div>
          </div>

          <h4 style={{ marginTop: '18px' }}>Current Medications</h4>

          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Drug</th>
                  <th style={thStyle}>Generic</th>
                  <th style={thStyle}>Strength</th>
                  <th style={thStyle}>Form</th>
                  <th style={thStyle}>Last Dispense</th>
                  <th style={thStyle}>Dispense Count</th>
                  <th style={thStyle}>Total Qty</th>
                </tr>
              </thead>

              <tbody>
                {profile.currentMedications.map((item) => (
                  <tr key={item.drug_code}>
                    <td style={tdStyle}>
                      {item.brand_name || item.drug_code || '-'}
                    </td>
                    <td style={tdStyle}>{item.generic_name || '-'}</td>
                    <td style={tdStyle}>{item.strength || '-'}</td>
                    <td style={tdStyle}>{item.dosage_form || '-'}</td>
                    <td style={tdStyle}>
                      {item.last_dispense_date
                        ? new Date(item.last_dispense_date).toLocaleDateString('en-GB')
                        : '-'}
                    </td>
                    <td style={tdStyle}>{item.dispense_count}</td>
                    <td style={tdStyle}>{item.total_quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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

const cardsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '12px',
}

const cardStyle = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '12px',
  padding: '14px',
}

const cardLabelStyle = {
  color: '#94a3b8',
  fontSize: '13px',
  marginBottom: '6px',
}

const cardValueStyle = {
  color: 'white',
  fontSize: '22px',
  fontWeight: 'bold',
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