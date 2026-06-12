import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import PatientDispenseForm from '../components/PatientDispenseForm'
import MedicationHistorySection from '../components/MedicationHistorySection'
import PatientMedicationProfile from '../components/PatientMedicationProfile'

export default function PatientRegistryPage() {
  const [organizationId, setOrganizationId] = useState('')
  const [patients, setPatients] = useState([])
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [medicationRefreshKey, setMedicationRefreshKey] = useState(0)


  const [form, setForm] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    patient_status: 'Active',
    gender: '',
    date_of_birth: '',
    mobile: '',
    email: '',
    address: '',
    insurance_provider: '',
    insurance_number: '',
    weight_kg: '',
    height_cm: '',
    allergies: 'No Known Drug Allergies',
    chronic_conditions: 'None',
    notes: '',
  })

  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadInitialData() {
    setLoading(true)

    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)

    if (orgError) {
      setMessage(`Error loading organization: ${orgError.message}`)
      setLoading(false)
      return
    }

    const orgId = orgData?.[0]?.id || ''
    setOrganizationId(orgId)

    if (orgId) {
      await loadPatients(orgId)
    }

    setLoading(false)
  }

  async function loadPatients(orgId = organizationId) {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(`Error loading patients: ${error.message}`)
      setPatients([])
      return
    }

    setPatients(data || [])
  }

  function updateForm(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  function resetForm() {
    setForm({
      first_name: '',
      middle_name: '',
      last_name: '',
      patient_status: 'Active',
      gender: '',
      date_of_birth: '',
      mobile: '',
      email: '',
      address: '',
      insurance_provider: '',
      insurance_number: '',
      weight_kg: '',
      height_cm: '',
      allergies: 'No Known Drug Allergies',
      chronic_conditions: 'None',
      notes: '',
    })
  }

  function buildPatientName() {
    return `${form.first_name} ${form.middle_name} ${form.last_name}`
      .replace(/\s+/g, ' ')
      .trim()
  }

  async function savePatient() {
    setMessage('')

    if (!organizationId) {
      setMessage('Organization not found.')
      return
    }

    if (!form.first_name || !form.last_name) {
      setMessage('First Name and Last Name are required.')
      return
    }

    setLoading(true)

    const fullName = buildPatientName()

    const payload = {
      organization_id: organizationId,

      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim() || null,
      last_name: form.last_name.trim(),

      patient_name: fullName,
      patient_status: form.patient_status || 'Active',

      gender: form.gender || null,
      date_of_birth: form.date_of_birth || null,

      mobile: form.mobile || null,
      email: form.email || null,
      address: form.address || null,

      insurance_provider: form.insurance_provider || null,
      insurance_number: form.insurance_number || null,

      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      height_cm: form.height_cm ? Number(form.height_cm) : null,

      allergies: form.allergies || null,
      chronic_conditions: form.chronic_conditions || null,
      notes: form.notes || null,

      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('patients').insert(payload)

    if (error) {
      setMessage(`Error: ${error.message}`)
      setLoading(false)
      return
    }

    setMessage('Patient saved successfully.')
    resetForm()
    await loadPatients()
    setLoading(false)
  }

  function calculateAge(dateOfBirth) {
    if (!dateOfBirth) return '-'

    const dob = new Date(dateOfBirth)
    const today = new Date()

    let age = today.getFullYear() - dob.getFullYear()
    const monthDiff = today.getMonth() - dob.getMonth()

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < dob.getDate())
    ) {
      age -= 1
    }

    return age
  }

  function calculateBMI(patient) {
    const weight = Number(patient?.weight_kg || 0)
    const heightCm = Number(patient?.height_cm || 0)

    if (!weight || !heightCm) return '-'

    const heightM = heightCm / 100
    return (weight / (heightM * heightM)).toFixed(1)
  }

  const filteredPatients = useMemo(() => {
    const term = search.toLowerCase().trim()

    if (!term) return patients

    return patients.filter((patient) => {
      return (
        patient.mrn?.toLowerCase().includes(term) ||
        patient.patient_name?.toLowerCase().includes(term) ||
        patient.first_name?.toLowerCase().includes(term) ||
        patient.middle_name?.toLowerCase().includes(term) ||
        patient.last_name?.toLowerCase().includes(term) ||
        patient.mobile?.toLowerCase().includes(term) ||
        patient.insurance_provider?.toLowerCase().includes(term)
      )
    })
  }, [patients, search])

  const totalPatients = patients.length
  const activePatients = patients.filter((p) => p.patient_status === 'Active').length
  const malePatients = patients.filter((p) => p.gender === 'Male').length
  const femalePatients = patients.filter((p) => p.gender === 'Female').length
  const allergyPatients = patients.filter(
    (p) => p.allergies && p.allergies !== 'No Known Drug Allergies'
  ).length

  return (
    <div style={{ padding: '24px', color: 'white' }}>
      <h1>Patient Registry</h1>

      <div style={statsGridStyle}>
        <div style={cardStyle}>
          <div>Total Patients</div>
          <h2>{totalPatients}</h2>
        </div>

        <div style={cardStyle}>
          <div>Active Patients</div>
          <h2>{activePatients}</h2>
        </div>

        <div style={cardStyle}>
          <div>Male</div>
          <h2>{malePatients}</h2>
        </div>

        <div style={cardStyle}>
          <div>Female</div>
          <h2>{femalePatients}</h2>
        </div>

        <div style={cardStyle}>
          <div>With Allergies</div>
          <h2>{allergyPatients}</h2>
        </div>
      </div>

      <div style={sectionStyle}>
        <h2>Add Patient</h2>

        <div style={noticeStyle}>
          MRN will be generated automatically by the system after saving.
        </div>

        <div style={formGridStyle}>
          <input
            style={inputStyle}
            placeholder="First Name *"
            value={form.first_name}
            onChange={(e) => updateForm('first_name', e.target.value)}
          />

          <input
            style={inputStyle}
            placeholder="Middle Name"
            value={form.middle_name}
            onChange={(e) => updateForm('middle_name', e.target.value)}
          />

          <input
            style={inputStyle}
            placeholder="Last Name *"
            value={form.last_name}
            onChange={(e) => updateForm('last_name', e.target.value)}
          />

          <select
            style={inputStyle}
            value={form.patient_status}
            onChange={(e) => updateForm('patient_status', e.target.value)}
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Deceased">Deceased</option>
          </select>

          <select
            style={inputStyle}
            value={form.gender}
            onChange={(e) => updateForm('gender', e.target.value)}
          >
            <option value="">Gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>

          <input
            style={inputStyle}
            type="date"
            value={form.date_of_birth}
            onChange={(e) => updateForm('date_of_birth', e.target.value)}
          />
                    <input
            style={inputStyle}
            placeholder="Mobile"
            value={form.mobile}
            onChange={(e) => updateForm('mobile', e.target.value)}
          />

          <input
            style={inputStyle}
            placeholder="Email"
            value={form.email}
            onChange={(e) => updateForm('email', e.target.value)}
          />

          <select
            style={inputStyle}
            value={form.insurance_provider}
            onChange={(e) => updateForm('insurance_provider', e.target.value)}
          >
            <option value="">Select Insurance</option>
            <option value="Thiqa">Thiqa</option>
            <option value="Daman">Daman</option>
            <option value="Inayah">Inayah</option>
            <option value="NAS">NAS</option>
            <option value="Nextcare">Nextcare</option>
            <option value="Other">Other</option>
          </select>

          <input
            style={inputStyle}
            placeholder="Insurance Number"
            value={form.insurance_number}
            onChange={(e) => updateForm('insurance_number', e.target.value)}
          />

          <input
            style={inputStyle}
            type="number"
            placeholder="Weight kg"
            value={form.weight_kg}
            onChange={(e) => updateForm('weight_kg', e.target.value)}
          />

          <input
            style={inputStyle}
            type="number"
            placeholder="Height cm"
            value={form.height_cm}
            onChange={(e) => updateForm('height_cm', e.target.value)}
          />

          <select
            style={inputStyle}
            value={form.allergies}
            onChange={(e) => updateForm('allergies', e.target.value)}
          >
            <option value="No Known Drug Allergies">No Known Drug Allergies</option>
            <option value="Penicillin">Penicillin</option>
            <option value="Sulfa">Sulfa</option>
            <option value="NSAIDs">NSAIDs</option>
            <option value="Aspirin">Aspirin</option>
            <option value="Other">Other</option>
          </select>

          <select
            style={inputStyle}
            value={form.chronic_conditions}
            onChange={(e) => updateForm('chronic_conditions', e.target.value)}
          >
            <option value="None">None</option>
            <option value="Hypertension">Hypertension</option>
            <option value="Diabetes">Diabetes</option>
            <option value="Asthma">Asthma</option>
            <option value="CKD">CKD</option>
            <option value="Heart Failure">Heart Failure</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <textarea
          style={textareaStyle}
          placeholder="Address"
          value={form.address}
          onChange={(e) => updateForm('address', e.target.value)}
        />

        <textarea
          style={textareaStyle}
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => updateForm('notes', e.target.value)}
        />

        <button onClick={savePatient} disabled={loading} style={buttonStyle}>
          {loading ? 'Saving...' : 'Save Patient'}
        </button>

        {message && (
          <div
            style={{
              marginTop: '12px',
              color: message.startsWith('Error') ? '#fca5a5' : '#86efac',
            }}
          >
            {message}
          </div>
        )}
      </div>

      <input
        style={{ ...inputStyle, marginBottom: '18px' }}
        placeholder="Search by MRN, Name, Mobile or Insurance..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr style={{ background: '#1e293b' }}>
              <th style={thStyle}>MRN</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Gender</th>
              <th style={thStyle}>DOB</th>
              <th style={thStyle}>Mobile</th>
              <th style={thStyle}>Insurance</th>
              <th style={thStyle}>Allergies</th>
            </tr>
          </thead>

          <tbody>
            {filteredPatients.map((patient) => (
              <tr
                key={patient.id}
                onClick={() => setSelectedPatient(patient)}
                style={{
                  cursor: 'pointer',
                  borderBottom: '1px solid #1e293b',
                }}
              >
                <td style={tdStyle}>{patient.mrn}</td>
                <td style={tdStyle}>{patient.patient_name}</td>
                <td style={tdStyle}>
  <span
    style={{
      color:
        String(patient.patient_status || '').toLowerCase() === 'active'
          ? '#34d399'
          : '#f87171',
      fontWeight: 'bold',
    }}
  >
    {patient.patient_status || '-'}
  </span>
</td>
                <td style={tdStyle}>{patient.gender || '-'}</td>
                <td style={tdStyle}>{patient.date_of_birth || '-'}</td>
                <td style={tdStyle}>{patient.mobile || '-'}</td>
                <td style={tdStyle}>{patient.insurance_provider || '-'}</td>
                <td style={tdStyle}>{patient.allergies || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedPatient && (
        <div onClick={() => setSelectedPatient(null)} style={modalOverlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
            <h2>Patient Profile</h2>

            <div style={profileGridStyle}>
              <div><strong>MRN:</strong> {selectedPatient.mrn}</div>
              <div><strong>Status:</strong> {selectedPatient.patient_status || '-'}</div>

              <div><strong>First Name:</strong> {selectedPatient.first_name || '-'}</div>
              <div><strong>Middle Name:</strong> {selectedPatient.middle_name || '-'}</div>
              <div><strong>Last Name:</strong> {selectedPatient.last_name || '-'}</div>
              <div><strong>Full Name:</strong> {selectedPatient.patient_name || '-'}</div>

              <div><strong>Gender:</strong> {selectedPatient.gender || '-'}</div>
              <div><strong>DOB:</strong> {selectedPatient.date_of_birth || '-'}</div>
              <div><strong>Age:</strong> {calculateAge(selectedPatient.date_of_birth)}</div>

              <div><strong>Mobile:</strong> {selectedPatient.mobile || '-'}</div>
              <div><strong>Email:</strong> {selectedPatient.email || '-'}</div>
              <div><strong>Insurance:</strong> {selectedPatient.insurance_provider || '-'}</div>
              <div><strong>Insurance No:</strong> {selectedPatient.insurance_number || '-'}</div>

              <div><strong>Weight:</strong> {selectedPatient.weight_kg || '-'} kg</div>
              <div><strong>Height:</strong> {selectedPatient.height_cm || '-'} cm</div>
              <div><strong>BMI:</strong> {calculateBMI(selectedPatient)}</div>
            </div>

            <hr style={{ borderColor: '#334155' }} />

     <p><strong>Address:</strong> {selectedPatient.address || '-'}</p>
<p><strong>Allergies:</strong> {selectedPatient.allergies || '-'}</p>
<p><strong>Chronic Conditions:</strong> {selectedPatient.chronic_conditions || '-'}</p>
<p><strong>Notes:</strong> {selectedPatient.notes || '-'}</p>

<PatientMedicationProfile
  patient={selectedPatient}
  refreshKey={medicationRefreshKey}
/>

<PatientDispenseForm
  patient={selectedPatient}
  onDispenseSaved={() => {
    setMedicationRefreshKey((prev) => prev + 1)
  }}
/>

<MedicationHistorySection
  patient={selectedPatient}
  refreshKey={medicationRefreshKey}
/>

<button onClick={() => setSelectedPatient(null)} style={buttonStyle}>
  Close
</button>
          </div>
        </div>
      )}
    </div>
  )
}

const statsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: '16px',
  marginBottom: '24px',
}
const noticeStyle = {
  background: '#020617',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '12px',
  color: '#93c5fd',
  marginBottom: '16px',
}

const sectionStyle = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '16px',
  padding: '20px',
  marginBottom: '24px',
}

const cardStyle = {
  background: '#0f172a',
  padding: '20px',
  borderRadius: '12px',
  border: '1px solid #334155',
}

const formGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '12px',
}

const inputStyle = {
  width: '100%',
  background: '#020617',
  color: 'white',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '12px',
  boxSizing: 'border-box',
}

const textareaStyle = {
  ...inputStyle,
  minHeight: '70px',
  marginTop: '12px',
}

const buttonStyle = {
  marginTop: '16px',
  background: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 18px',
  cursor: 'pointer',
  fontWeight: 'bold',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  background: '#0f172a',
  borderRadius: '16px',
  overflow: 'hidden',
}

const thStyle = {
  textAlign: 'left',
  padding: '14px',
  color: 'white',
  borderBottom: '1px solid #334155',
}

const tdStyle = {
  padding: '14px',
  color: '#cbd5e1',
  borderBottom: '1px solid #1e293b',
}

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
}

const modalStyle = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '16px',
  padding: '24px',
  width: '760px',
  maxHeight: '90vh',
  overflowY: 'auto',
  color: 'white',
}

const profileGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '12px',
  marginBottom: '16px',
}