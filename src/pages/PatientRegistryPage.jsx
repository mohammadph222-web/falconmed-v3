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
  const [messageType, setMessageType] = useState('success')
  const [medicationRefreshKey, setMedicationRefreshKey] = useState(0)
  const [showForm, setShowForm] = useState(false)

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
      showMsg(`Error loading organization: ${orgError.message}`, 'error')
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
      showMsg(`Error loading patients: ${error.message}`, 'error')
      setPatients([])
      return
    }

    setPatients(data || [])
  }

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
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

  function showMsg(text, type = 'success') {
    setMessage(text)
    setMessageType(type)
  }

  async function savePatient() {
    setMessage('')

    if (!organizationId) {
      showMsg('Organization not found.', 'error')
      return
    }

    if (!form.first_name || !form.last_name) {
      showMsg('First name and last name are required.', 'error')
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
      showMsg(`Error: ${error.message}`, 'error')
      setLoading(false)
      return
    }

    showMsg('Patient saved successfully.')
    resetForm()
    setShowForm(false)
    await loadPatients()
    setLoading(false)
  }

  function calculateAge(dateOfBirth) {
    if (!dateOfBirth) return '-'
    const dob = new Date(dateOfBirth)
    const today = new Date()
    let age = today.getFullYear() - dob.getFullYear()
    const monthDiff = today.getMonth() - dob.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
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
  const activePatients = patients.filter(
    (p) => p.patient_status === 'Active'
  ).length
  const malePatients = patients.filter((p) => p.gender === 'Male').length
  const femalePatients = patients.filter((p) => p.gender === 'Female').length
  const allergyPatients = patients.filter(
    (p) => p.allergies && p.allergies !== 'No Known Drug Allergies'
  ).length

  return (
    <div>
      <div className="fm-page-header">
        <div className="fm-page-header-top">
          <div>
            <div className="fm-page-header-meta">Operations</div>
            <h1 className="fm-page-header-title">Patient registry</h1>
            <p className="fm-page-header-desc">
              Register and manage patients, view medication profiles, and
              record dispense events.
            </p>
          </div>
          <div className="fm-page-header-actions">
            <button
              className="fm-btn"
              onClick={() => {
                setShowForm((v) => !v)
                setMessage('')
              }}
            >
              {showForm ? 'Cancel' : '+ Add patient'}
            </button>
          </div>
        </div>
      </div>

      <div className="fm-grid-kpi" style={{ marginBottom: '20px' }}>
        <PatientKpiCard
          label="Total patients"
          value={totalPatients}
          color="var(--color-text-accent)"
          barColor="var(--color-primary)"
        />
        <PatientKpiCard
          label="Active"
          value={activePatients}
          color="var(--color-success)"
          barColor="var(--color-success)"
        />
        <PatientKpiCard
          label="Male"
          value={malePatients}
          color="var(--color-text-accent)"
          barColor="var(--color-primary)"
        />
        <PatientKpiCard
          label="Female"
          value={femalePatients}
          color="var(--color-text-accent)"
          barColor="var(--color-primary)"
        />
        <PatientKpiCard
          label="With allergies"
          value={allergyPatients}
          color="var(--color-warning-mid)"
          barColor="var(--color-warning-mid)"
        />
      </div>

      {showForm && (
        <div className="fm-card" style={{ marginBottom: '20px' }}>
          <div
            style={{
              marginBottom: '16px',
              paddingBottom: '14px',
              borderBottom: '1px solid var(--color-border-subtle)',
            }}
          >
            <h2
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 'var(--font-medium)',
                color: 'var(--color-text-primary)',
                margin: 0,
              }}
            >
              Add patient
            </h2>
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-accent)',
                marginTop: '6px',
                padding: '6px 10px',
                background: 'rgba(24,95,165,0.10)',
                border: '1px solid rgba(24,95,165,0.25)',
                borderRadius: 'var(--radius-md)',
                display: 'inline-block',
              }}
            >
              MRN will be generated automatically after saving.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '12px',
              marginBottom: '12px',
            }}
          >
            {[
              { placeholder: 'First name *', field: 'first_name', type: 'text' },
              { placeholder: 'Middle name', field: 'middle_name', type: 'text' },
              { placeholder: 'Last name *', field: 'last_name', type: 'text' },
            ].map(({ placeholder, field, type }) => (
              <input
                key={field}
                type={type}
                placeholder={placeholder}
                value={form[field]}
                onChange={(e) => updateForm(field, e.target.value)}
                style={formInputStyle}
              />
            ))}

            <select
              value={form.patient_status}
              onChange={(e) => updateForm('patient_status', e.target.value)}
              style={formInputStyle}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Deceased">Deceased</option>
            </select>

            <select
              value={form.gender}
              onChange={(e) => updateForm('gender', e.target.value)}
              style={formInputStyle}
            >
              <option value="">Gender</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>

            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => updateForm('date_of_birth', e.target.value)}
              style={formInputStyle}
            />

            <input
              type="text"
              placeholder="Mobile"
              value={form.mobile}
              onChange={(e) => updateForm('mobile', e.target.value)}
              style={formInputStyle}
            />

            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => updateForm('email', e.target.value)}
              style={formInputStyle}
            />

            <select
              value={form.insurance_provider}
              onChange={(e) => updateForm('insurance_provider', e.target.value)}
              style={formInputStyle}
            >
              <option value="">Select insurance</option>
              <option value="Thiqa">Thiqa</option>
              <option value="Daman">Daman</option>
              <option value="Inayah">Inayah</option>
              <option value="NAS">NAS</option>
              <option value="Nextcare">Nextcare</option>
              <option value="Other">Other</option>
            </select>

            <input
              type="text"
              placeholder="Insurance number"
              value={form.insurance_number}
              onChange={(e) => updateForm('insurance_number', e.target.value)}
              style={formInputStyle}
            />

            <input
              type="number"
              placeholder="Weight (kg)"
              value={form.weight_kg}
              onChange={(e) => updateForm('weight_kg', e.target.value)}
              style={formInputStyle}
            />

            <input
              type="number"
              placeholder="Height (cm)"
              value={form.height_cm}
              onChange={(e) => updateForm('height_cm', e.target.value)}
              style={formInputStyle}
            />

            <select
              value={form.allergies}
              onChange={(e) => updateForm('allergies', e.target.value)}
              style={formInputStyle}
            >
              <option value="No Known Drug Allergies">No known drug allergies</option>
              <option value="Penicillin">Penicillin</option>
              <option value="Sulfa">Sulfa</option>
              <option value="NSAIDs">NSAIDs</option>
              <option value="Aspirin">Aspirin</option>
              <option value="Other">Other</option>
            </select>

            <select
              value={form.chronic_conditions}
              onChange={(e) => updateForm('chronic_conditions', e.target.value)}
              style={formInputStyle}
            >
              <option value="None">None</option>
              <option value="Hypertension">Hypertension</option>
              <option value="Diabetes">Diabetes</option>
              <option value="Asthma">Asthma</option>
              <option value="CKD">CKD</option>
              <option value="Heart Failure">Heart failure</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <textarea
            placeholder="Address"
            value={form.address}
            onChange={(e) => updateForm('address', e.target.value)}
            style={{ ...formInputStyle, minHeight: '60px', resize: 'vertical', marginBottom: '10px' }}
          />

          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => updateForm('notes', e.target.value)}
            style={{ ...formInputStyle, minHeight: '60px', resize: 'vertical', marginBottom: '16px' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={savePatient}
              disabled={loading}
              className="fm-btn fm-btn-primary"
              style={{ opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Saving...' : 'Save patient'}
            </button>

            {message && (
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 'var(--font-medium)',
                  color:
                    messageType === 'error'
                      ? 'var(--color-danger-mid)'
                      : 'var(--color-success)',
                }}
              >
                {messageType === 'error' ? '✕ ' : '✓ '}
                {message}
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '14px' }}>
        <input
          type="text"
          placeholder="Search by MRN, name, mobile or insurance..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setSelectedPatient(null)
          }}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-default)',
            background: 'var(--color-bg-input)',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--text-base)',
            fontFamily: 'var(--font-sans)',
          }}
        />
      </div>

      {loading && (
        <div className="fm-card" style={{ color: 'var(--color-text-secondary)' }}>
          Loading patients...
        </div>
      )}

      {!loading && filteredPatients.length === 0 && (
        <div className="fm-empty-state">
          <div className="fm-empty-state-title">No patients found</div>
          <div className="fm-empty-state-desc">
            {search ? 'Try a different search term.' : 'Add the first patient using the button above.'}
          </div>
        </div>
      )}

      {!loading && filteredPatients.length > 0 && (
        <div className="fm-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '16px' }}>
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid var(--color-border-subtle)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <strong style={{ color: 'var(--color-text-primary)' }}>
              {filteredPatients.length.toLocaleString()}
            </strong>{' '}
            patients · Click a row to view profile
          </div>
          <div className="fm-table-wrap">
            <table className="fm-table">
              <thead>
                <tr>
                  <th>MRN</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Gender</th>
                  <th>DOB</th>
                  <th>Mobile</th>
                  <th>Insurance</th>
                  <th>Allergies</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    onClick={() =>
                      setSelectedPatient(
                        selectedPatient?.id === patient.id ? null : patient
                      )
                    }
                    style={{
                      cursor: 'pointer',
                      background:
                        selectedPatient?.id === patient.id
                          ? 'var(--color-bg-card-hover)'
                          : undefined,
                    }}
                  >
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-accent)',
                        }}
                      >
                        {patient.mrn}
                      </span>
                    </td>
                    <td>
                      <div
                        style={{
                          fontWeight: 'var(--font-medium)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {patient.patient_name}
                      </div>
                    </td>
                    <td>
                      <PatientStatusBadge status={patient.patient_status} />
                    </td>
                    <td className="fm-table-muted">{patient.gender || '-'}</td>
                    <td className="fm-table-muted">
                      {patient.date_of_birth || '-'}
                    </td>
                    <td className="fm-table-muted">{patient.mobile || '-'}</td>
                    <td className="fm-table-muted">
                      {patient.insurance_provider || '-'}
                    </td>
                    <td
                      style={{
                        fontSize: 'var(--text-xs)',
                        color:
                          patient.allergies &&
                          patient.allergies !== 'No Known Drug Allergies'
                            ? 'var(--color-warning-mid)'
                            : 'var(--color-text-tertiary)',
                      }}
                    >
                      {patient.allergies || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedPatient && (
        <div className="fm-card" style={{ marginTop: '4px' }}>
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
                {selectedPatient.patient_name}
              </h2>
              <p
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-secondary)',
                  margin: '4px 0 0',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-accent)',
                    marginRight: '10px',
                  }}
                >
                  {selectedPatient.mrn}
                </span>
                <PatientStatusBadge status={selectedPatient.patient_status} />
              </p>
            </div>
            <button
              className="fm-btn"
              style={{ fontSize: 'var(--text-xs)', padding: '4px 10px' }}
              onClick={() => setSelectedPatient(null)}
            >
              ✕ Close
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '10px',
              marginBottom: '20px',
            }}
          >
            <ProfileField label="First name" value={selectedPatient.first_name} />
            <ProfileField label="Middle name" value={selectedPatient.middle_name} />
            <ProfileField label="Last name" value={selectedPatient.last_name} />
            <ProfileField label="Gender" value={selectedPatient.gender} />
            <ProfileField label="Date of birth" value={selectedPatient.date_of_birth} />
            <ProfileField label="Age" value={calculateAge(selectedPatient.date_of_birth)} />
            <ProfileField label="Mobile" value={selectedPatient.mobile} />
            <ProfileField label="Email" value={selectedPatient.email} />
            <ProfileField label="Insurance" value={selectedPatient.insurance_provider} />
            <ProfileField label="Insurance no." value={selectedPatient.insurance_number} />
            <ProfileField label="Weight" value={selectedPatient.weight_kg ? `${selectedPatient.weight_kg} kg` : null} />
            <ProfileField label="Height" value={selectedPatient.height_cm ? `${selectedPatient.height_cm} cm` : null} />
            <ProfileField label="BMI" value={calculateBMI(selectedPatient)} />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
              marginBottom: '20px',
              paddingTop: '14px',
              borderTop: '1px solid var(--color-border-subtle)',
            }}
          >
            <ProfileField label="Address" value={selectedPatient.address} />
            <ProfileField
              label="Allergies"
              value={selectedPatient.allergies}
              highlight={
                selectedPatient.allergies &&
                selectedPatient.allergies !== 'No Known Drug Allergies'
              }
            />
            <ProfileField label="Chronic conditions" value={selectedPatient.chronic_conditions} />
            <ProfileField label="Notes" value={selectedPatient.notes} />
          </div>

          <div
            style={{
              paddingTop: '16px',
              borderTop: '1px solid var(--color-border-subtle)',
            }}
          >
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
          </div>
        </div>
      )}
    </div>
  )
}

function PatientKpiCard({ label, value, color, barColor }) {
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

function PatientStatusBadge({ status }) {
  const isActive =
    String(status || '').toLowerCase() === 'active'

  const style = isActive
    ? {
        color: 'var(--color-success)',
        background: 'rgba(29,158,117,0.12)',
        border: '1px solid rgba(29,158,117,0.30)',
      }
    : {
        color: 'var(--color-danger-mid)',
        background: 'rgba(163,45,45,0.12)',
        border: '1px solid rgba(163,45,45,0.30)',
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
      {status || 'Unknown'}
    </span>
  )
}

function ProfileField({ label, value, highlight }) {
  return (
    <div
      style={{
        background: 'var(--color-bg-content)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '8px 12px',
      }}
    >
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
          fontWeight: 'var(--font-medium)',
          color: highlight
            ? 'var(--color-warning-mid)'
            : 'var(--color-text-primary)',
          lineHeight: 1.4,
        }}
      >
        {value || '—'}
      </div>
    </div>
  )
}

const formInputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-default)',
  background: 'var(--color-bg-input)',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--text-base)',
  fontFamily: 'var(--font-sans)',
  boxSizing: 'border-box',
}
