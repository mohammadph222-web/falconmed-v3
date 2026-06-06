import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dispenseMedicationToPatient } from '../services/patientDispenseService'

export default function PatientDispenseForm({ patient, onDispenseSaved }) {
  const [pharmacies, setPharmacies] = useState([])
  const [inventory, setInventory] = useState([])
  const [selectedPharmacyId, setSelectedPharmacyId] = useState('')
  const [selectedInventoryId, setSelectedInventoryId] = useState('')

  const [quantity, setQuantity] = useState('')
  const [directions, setDirections] = useState('')
  const [durationDays, setDurationDays] = useState('')
  const [prescribingDoctor, setPrescribingDoctor] = useState('')
  const [indication, setIndication] = useState('')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadPharmacies()
  }, [])

  async function loadPharmacies() {
    const { data, error } = await supabase
      .from('pharmacies')
      .select('id, name, code')
      .order('name')

    if (error) {
      setMessage(`Error loading pharmacies: ${error.message}`)
      return
    }

    setPharmacies(data || [])

    if (data?.length) {
      setSelectedPharmacyId(data[0].id)
      await loadInventory(data[0].id)
    }
  }

  async function loadInventory(pharmacyId) {
    setLoading(true)

    const { data: inventoryData, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .gt('quantity_on_hand', 0)
      .order('drug_code')

    if (error) {
      setInventory([])
      setSelectedInventoryId('')
      setMessage(`Error loading inventory: ${error.message}`)
      setLoading(false)
      return
    }

    const drugCodes = [
      ...new Set((inventoryData || []).map((item) => item.drug_code).filter(Boolean)),
    ]

    let drugMap = new Map()

    if (drugCodes.length > 0) {
      const { data: drugData } = await supabase
        .from('drug_master_reference')
        .select('drug_code, generic_name, brand_name, strength, dosage_form')
        .in('drug_code', drugCodes)

      drugMap = new Map((drugData || []).map((drug) => [drug.drug_code, drug]))
    }

    const merged = (inventoryData || []).map((item) => ({
      ...item,
      drug: drugMap.get(item.drug_code) || null,
    }))

    setInventory(merged)
    setSelectedInventoryId(merged[0]?.id || '')
    setLoading(false)
  }

  async function handlePharmacyChange(pharmacyId) {
    setSelectedPharmacyId(pharmacyId)
    setSelectedInventoryId('')
    setMessage('')
    await loadInventory(pharmacyId)
  }

  const selectedItem = useMemo(() => {
    return inventory.find((item) => item.id === selectedInventoryId)
  }, [inventory, selectedInventoryId])

  function resetFormAfterSave() {
    setQuantity('')
    setDirections('')
    setDurationDays('')
    setPrescribingDoctor('')
    setIndication('')
  }

  async function handleSaveDispense() {
    setMessage('')

    if (!patient?.id) {
      setMessage('Patient is required.')
      return
    }

    if (!selectedPharmacyId) {
      setMessage('Pharmacy is required.')
      return
    }

    if (!selectedInventoryId) {
      setMessage('Drug is required.')
      return
    }

    setLoading(true)

    try {
      await dispenseMedicationToPatient({
        patientId: patient.id,
        pharmacyId: selectedPharmacyId,
        inventoryId: selectedInventoryId,
        quantity,
        directions,
        durationDays,
        prescribingDoctor,
        indication,
        createdBy: null,
      })

      setMessage('Medication dispensed successfully.')
      resetFormAfterSave()
      await loadInventory(selectedPharmacyId)

      if (onDispenseSaved) {
        onDispenseSaved()
      }
    } catch (error) {
      setMessage(`Error: ${error.message}`)
    }

    setLoading(false)
  }

  return (
    <div style={sectionStyle}>
      <h3>Dispense Medication</h3>

      <div style={patientBoxStyle}>
        <div><strong>Patient:</strong> {patient?.patient_name || '-'}</div>
        <div><strong>MRN:</strong> {patient?.mrn || '-'}</div>
        <div><strong>Allergies:</strong> {patient?.allergies || '-'}</div>
      </div>

      <div style={formGridStyle}>
        <div>
          <label style={labelStyle}>Pharmacy</label>
          <select
            style={inputStyle}
            value={selectedPharmacyId}
            onChange={(e) => handlePharmacyChange(e.target.value)}
          >
            {pharmacies.map((pharmacy) => (
              <option key={pharmacy.id} value={pharmacy.id}>
                {pharmacy.name} ({pharmacy.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Drug</label>
          <select
            style={inputStyle}
            value={selectedInventoryId}
            onChange={(e) => setSelectedInventoryId(e.target.value)}
          >
            {inventory.map((item) => (
              <option key={item.id} value={item.id}>
                {item.drug?.brand_name || item.drug_code}
                {' — '}
                {item.drug?.generic_name || ''}
                {' — '}
                {item.drug?.strength || ''}
                {' — Stock: '}
                {item.quantity_on_hand}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Quantity</label>
          <input
            style={inputStyle}
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Quantity"
          />
        </div>

        <div>
          <label style={labelStyle}>Duration Days</label>
          <input
            style={inputStyle}
            type="number"
            min="1"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            placeholder="Duration"
          />
        </div>

        <div>
          <label style={labelStyle}>Prescribing Doctor</label>
          <input
            style={inputStyle}
            value={prescribingDoctor}
            onChange={(e) => setPrescribingDoctor(e.target.value)}
            placeholder="Doctor name"
          />
        </div>

        <div>
          <label style={labelStyle}>Indication</label>
          <input
            style={inputStyle}
            value={indication}
            onChange={(e) => setIndication(e.target.value)}
            placeholder="Indication"
          />
        </div>
      </div>

      {selectedItem && (
        <div style={stockBoxStyle}>
          <div><strong>Drug Code:</strong> {selectedItem.drug_code}</div>
          <div><strong>Current Stock:</strong> {selectedItem.quantity_on_hand}</div>
          <div><strong>Dosage Form:</strong> {selectedItem.drug?.dosage_form || '-'}</div>
        </div>
      )}

      <div style={{ marginTop: '12px' }}>
        <label style={labelStyle}>Directions</label>
        <textarea
          style={textareaStyle}
          value={directions}
          onChange={(e) => setDirections(e.target.value)}
          placeholder="Example: Take 1 tablet twice daily after meals"
        />
      </div>

      <button onClick={handleSaveDispense} disabled={loading} style={buttonStyle}>
        {loading ? 'Saving...' : 'Save Patient Dispense'}
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
  )
}

const sectionStyle = {
  background: '#020617',
  border: '1px solid #334155',
  borderRadius: '14px',
  padding: '18px',
  marginTop: '18px',
}

const patientBoxStyle = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '12px',
  padding: '12px',
  marginBottom: '14px',
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '10px',
}

const formGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '12px',
}

const labelStyle = {
  display: 'block',
  marginBottom: '6px',
  color: '#cbd5e1',
}

const inputStyle = {
  width: '100%',
  background: '#020617',
  color: 'white',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '10px',
  boxSizing: 'border-box',
}

const textareaStyle = {
  ...inputStyle,
  minHeight: '70px',
}

const stockBoxStyle = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '12px',
  padding: '12px',
  marginTop: '14px',
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '10px',
}

const buttonStyle = {
  marginTop: '14px',
  background: '#16a34a',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 18px',
  cursor: 'pointer',
  fontWeight: 'bold',
}