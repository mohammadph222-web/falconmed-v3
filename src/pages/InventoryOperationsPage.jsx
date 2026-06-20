import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function InventoryOperationsPage() {
  const [operation, setOperation] = useState('ADJUSTMENT_PLUS')
  const [pharmacies, setPharmacies] = useState([])
  const [inventory, setInventory] = useState([])
  const [selectedPharmacyId, setSelectedPharmacyId] = useState('')
  const [destinationPharmacyId, setDestinationPharmacyId] = useState('')
  const [selectedInventoryId, setSelectedInventoryId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
    const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadInitialData()
  }, [])

  async function loadInitialData() {
    setLoading(true)

    const { data: pharmacyData } = await supabase
      .from('pharmacies')
      .select('id, organization_id, name, code')
      .order('name')

    setPharmacies(pharmacyData || [])

    if (pharmacyData?.length) {
      setSelectedPharmacyId(pharmacyData[0].id)
      setDestinationPharmacyId(pharmacyData[1]?.id || pharmacyData[0].id)
      await loadInventory(pharmacyData[0].id)
    }

    setLoading(false)
  }

  async function loadInventory(pharmacyId) {
    const { data: inventoryData, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('drug_code')

    if (error) {
      console.error('Inventory load error:', error)
      setInventory([])
      return
    }

    const drugCodes = [
      ...new Set((inventoryData || []).map((item) => item.drug_code).filter(Boolean)),
    ]

    let drugMap = new Map()

    if (drugCodes.length > 0) {
      const { data: drugData } = await supabase
        .from('drug_master_reference')
        .select('drug_code, generic_name, brand_name, strength')
        .in('drug_code', drugCodes)

      drugMap = new Map((drugData || []).map((drug) => [drug.drug_code, drug]))
    }

    const merged = (inventoryData || []).map((item) => ({
      ...item,
      drug: drugMap.get(item.drug_code) || null,
    }))

    setInventory(merged)
    setSelectedInventoryId(merged[0]?.id || '')
  }

  const selectedItem = useMemo(
    () => inventory.find((item) => item.id === selectedInventoryId),
    [inventory, selectedInventoryId]
  )

  const selectedPharmacy = pharmacies.find((p) => p.id === selectedPharmacyId)
  const destinationPharmacy = pharmacies.find((p) => p.id === destinationPharmacyId)

  async function handlePharmacyChange(pharmacyId) {
    setSelectedPharmacyId(pharmacyId)
    setMessage('')
    await loadInventory(pharmacyId)
  }

  function resetForm() {
  setQuantity('')
  setNotes('')
  setReason('')
}

  async function insertTransaction({
    type,
    sourcePharmacyId = null,
    destinationPharmacyIdValue = null,
    qty,
    transactionNotes,
  }) {
    const { error } = await supabase.from('inventory_transactions').insert({
      organization_id: selectedItem.organization_id,
      source_pharmacy_id: sourcePharmacyId,
      destination_pharmacy_id: destinationPharmacyIdValue,
      drug_code: selectedItem.drug_code,
      quantity: qty,
      transaction_type: type,
      notes: transactionNotes,
    })

    if (error) {
      throw error
    }
  }

  async function handleAdjustmentPlus() {
    const qty = Number(quantity)

    if (!selectedItem || qty <= 0) {
      setMessage('Please select a drug and enter a valid quantity.')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const newQty = Number(selectedItem.quantity_on_hand || 0) + qty

      const { error: updateError } = await supabase
        .from('inventory')
        .update({
          quantity_on_hand: newQty,
          last_updated: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedItem.id)

      if (updateError) throw updateError

      await insertTransaction({
        type: 'ADJUSTMENT_PLUS',
        sourcePharmacyId: null,
        destinationPharmacyIdValue: selectedPharmacyId,
        qty,
        transactionNotes:
  notes ||
  `Reason: ${reason || 'NOT_SPECIFIED'} | Adjustment plus: add ${qty} units`,
      })

      setMessage('Adjustment + saved successfully.')
      resetForm()
      await loadInventory(selectedPharmacyId)
    } catch (error) {
      console.error(error)
      setMessage(`Error: ${error.message}`)
    }

    setLoading(false)
  }

  async function handleAdjustmentMinus() {
    const qty = Number(quantity)

    if (!selectedItem || qty <= 0) {
      setMessage('Please select a drug and enter a valid quantity.')
      return
    }

    if (Number(selectedItem.quantity_on_hand || 0) < qty) {
      setMessage('Not enough stock for this adjustment.')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const newQty = Number(selectedItem.quantity_on_hand || 0) - qty

      const { error: updateError } = await supabase
        .from('inventory')
        .update({
          quantity_on_hand: newQty,
          last_updated: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedItem.id)

      if (updateError) throw updateError

      await insertTransaction({
        type: 'ADJUSTMENT_MINUS',
        sourcePharmacyId: selectedPharmacyId,
        destinationPharmacyIdValue: null,
        qty,
        transactionNotes:
  notes ||
  `Reason: ${reason || 'NOT_SPECIFIED'} | Adjustment minus: remove ${qty} units`,
      })

      setMessage('Adjustment - saved successfully.')
      resetForm()
      await loadInventory(selectedPharmacyId)
    } catch (error) {
      console.error(error)
      setMessage(`Error: ${error.message}`)
    }

    setLoading(false)
  }

  async function handleDispense() {
    const qty = Number(quantity)

    if (!selectedItem || qty <= 0) {
      setMessage('Please select a drug and enter a valid quantity.')
      return
    }

    if (Number(selectedItem.quantity_on_hand || 0) < qty) {
      setMessage('Not enough stock to dispense.')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const newQty = Number(selectedItem.quantity_on_hand || 0) - qty

      const { error: updateError } = await supabase
        .from('inventory')
        .update({
          quantity_on_hand: newQty,
          last_updated: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedItem.id)

      if (updateError) throw updateError

      await insertTransaction({
        type: 'DISPENSE',
        sourcePharmacyId: selectedPharmacyId,
        destinationPharmacyIdValue: null,
        qty,
        transactionNotes: notes || `Dispense: ${qty} units`,
      })

      setMessage('Dispense saved successfully.')
      resetForm()
      await loadInventory(selectedPharmacyId)
    } catch (error) {
      console.error(error)
      setMessage(`Error: ${error.message}`)
    }

    setLoading(false)
  }

  async function handleTransfer() {
    const qty = Number(quantity)

    if (!selectedItem || qty <= 0) {
      setMessage('Please select a drug and enter a valid quantity.')
      return
    }

    if (!destinationPharmacyId || selectedPharmacyId === destinationPharmacyId) {
      setMessage('Please select a different destination pharmacy.')
      return
    }

    if (Number(selectedItem.quantity_on_hand || 0) < qty) {
      setMessage('Not enough stock to transfer.')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const sourceNewQty = Number(selectedItem.quantity_on_hand || 0) - qty

      const { error: sourceError } = await supabase
        .from('inventory')
        .update({
          quantity_on_hand: sourceNewQty,
          last_updated: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedItem.id)

      if (sourceError) throw sourceError

      const { data: destinationRows, error: destinationLoadError } = await supabase
        .from('inventory')
        .select('*')
        .eq('pharmacy_id', destinationPharmacyId)
        .eq('drug_code', selectedItem.drug_code)
        .limit(1)

      if (destinationLoadError) throw destinationLoadError

      const destinationItem = destinationRows?.[0]

      if (destinationItem) {
        const destinationNewQty = Number(destinationItem.quantity_on_hand || 0) + qty

        const { error: destinationUpdateError } = await supabase
          .from('inventory')
          .update({
            quantity_on_hand: destinationNewQty,
            last_updated: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', destinationItem.id)

        if (destinationUpdateError) throw destinationUpdateError
      } else {
        const { error: destinationInsertError } = await supabase
          .from('inventory')
          .insert({
            organization_id: selectedItem.organization_id,
            pharmacy_id: destinationPharmacyId,
            drug_code: selectedItem.drug_code,
            quantity_on_hand: qty,
            minimum_stock: selectedItem.minimum_stock || 0,
            maximum_stock: selectedItem.maximum_stock || 0,
            last_updated: new Date().toISOString(),
          })

        if (destinationInsertError) throw destinationInsertError
      }

      await insertTransaction({
  type: 'TRANSFER_OUT',
  sourcePharmacyId: selectedPharmacyId,
  destinationPharmacyIdValue: destinationPharmacyId,
  qty,
  transactionNotes:
    notes ||
    `Reason: ${reason || 'NOT_SPECIFIED'} | Transfer out: ${qty} units from ${selectedPharmacy?.name || 'source pharmacy'} to ${
      destinationPharmacy?.name || 'destination pharmacy'
    }`,
})

      await insertTransaction({
  type: 'TRANSFER_IN',
  sourcePharmacyId: selectedPharmacyId,
  destinationPharmacyIdValue: destinationPharmacyId,
  qty,
  transactionNotes:
    notes ||
    `Reason: ${reason || 'NOT_SPECIFIED'} | Transfer in: ${qty} units received by ${destinationPharmacy?.name || 'destination pharmacy'}`,
})

      setMessage('Transfer saved successfully.')
      resetForm()
      await loadInventory(selectedPharmacyId)
    } catch (error) {
  console.error('TRANSFER ERROR FULL:', error)
  console.log('MESSAGE:', error.message)
  console.log('DETAILS:', error.details)
  console.log('HINT:', error.hint)
  console.log('CODE:', error.code)

  setMessage(`Error: ${error.message}`)
}

    setLoading(false)
  }

  async function handleSubmit() {
    if (operation === 'ADJUSTMENT_PLUS') {
      await handleAdjustmentPlus()
    }

    if (operation === 'ADJUSTMENT_MINUS') {
      await handleAdjustmentMinus()
    }

    if (operation === 'DISPENSE') {
      await handleDispense()
    }

    if (operation === 'TRANSFER') {
      await handleTransfer()
    }
  }

  return (
    <div style={{ padding: '24px', color: 'white' }}>
      <h1>Inventory Operations</h1>

      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button onClick={() => setOperation('ADJUSTMENT_PLUS')} style={tabStyle(operation === 'ADJUSTMENT_PLUS')}>
            Adjustment +
          </button>

          <button onClick={() => setOperation('ADJUSTMENT_MINUS')} style={tabStyle(operation === 'ADJUSTMENT_MINUS')}>
            Adjustment -
          </button>

          <button onClick={() => setOperation('DISPENSE')} style={tabStyle(operation === 'DISPENSE')}>
            Dispense
          </button>

          <button onClick={() => setOperation('TRANSFER')} style={tabStyle(operation === 'TRANSFER')}>
            Transfer
          </button>
        </div>

        <div style={formGridStyle}>
          <div>
            <label style={labelStyle}>Pharmacy</label>
            <select
              value={selectedPharmacyId}
              onChange={(e) => handlePharmacyChange(e.target.value)}
              style={inputStyle}
            >
              {pharmacies.map((pharmacy) => (
                <option key={pharmacy.id} value={pharmacy.id}>
                  {pharmacy.name} ({pharmacy.code})
                </option>
              ))}
            </select>
          </div>

          {operation === 'TRANSFER' && (
            <div>
              <label style={labelStyle}>Destination Pharmacy</label>
              <select
                value={destinationPharmacyId}
                onChange={(e) => setDestinationPharmacyId(e.target.value)}
                style={inputStyle}
              >
                {pharmacies.map((pharmacy) => (
                  <option key={pharmacy.id} value={pharmacy.id}>
                    {pharmacy.name} ({pharmacy.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>Drug</label>
            <select
              value={selectedInventoryId}
              onChange={(e) => setSelectedInventoryId(e.target.value)}
              style={inputStyle}
            >
              {inventory.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.drug?.brand_name || item.drug_code} — {item.drug?.generic_name || ''} — Stock: {item.quantity_on_hand}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Quantity</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              style={inputStyle}
              placeholder="Enter quantity"
            />
          </div>
        </div>
                  
                {operation !== 'DISPENSE' && (
  <div>
    <label style={labelStyle}>Reason</label>
    <select
      value={reason}
      onChange={(e) => setReason(e.target.value)}
      style={inputStyle}
    >
      <option value="">Select reason</option>

      {(operation === 'ADJUSTMENT_PLUS' || operation === 'ADJUSTMENT_MINUS') && (
        <>
          <option value="STOCK_CORRECTION">Stock Correction</option>
          <option value="EXPIRED">Expired</option>
          <option value="DAMAGED">Damaged</option>
          <option value="LOST">Lost</option>
          <option value="FOUND">Found</option>
          <option value="OPENING_BALANCE_CORRECTION">
            Opening Balance Correction
          </option>
        </>
      )}

      {operation === 'TRANSFER' && (
        <>
          <option value="LOW_STOCK">Low Stock</option>
          <option value="OVERSTOCK_REBALANCING">
            Overstock Rebalancing
          </option>
          <option value="EMERGENCY_REQUEST">Emergency Request</option>
          <option value="ROUTINE_REPLENISHMENT">
            Routine Replenishment
          </option>
        </>
      )}
    </select>
  </div>
)}
        {selectedItem && (
          <div style={infoBoxStyle}>
            <div><strong>Drug Code:</strong> {selectedItem.drug_code}</div>
            <div><strong>Current Stock:</strong> {selectedItem.quantity_on_hand}</div>
            <div><strong>Min:</strong> {selectedItem.minimum_stock}</div>
            <div><strong>Max:</strong> {selectedItem.maximum_stock}</div>
          </div>
        )}

        <div style={{ marginTop: '16px' }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...inputStyle, minHeight: '90px' }}
            placeholder="Optional notes"
          />
        </div>

        <button onClick={handleSubmit} disabled={loading} style={saveButtonStyle}>
          {loading ? 'Saving...' : 'Save Operation'}
        </button>

        {message && (
          <div style={{ marginTop: '16px', color: message.startsWith('Error') ? '#fca5a5' : '#86efac' }}>
            {message}
          </div>
        )}
      </div>
    </div>
  )
}

const cardStyle = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '16px',
  padding: '24px',
}

const formGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '16px',
}

const labelStyle = {
  display: 'block',
  marginBottom: '8px',
  color: '#cbd5e1',
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

const infoBoxStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: '12px',
  marginTop: '18px',
  background: '#020617',
  border: '1px solid #1e293b',
  borderRadius: '12px',
  padding: '16px',
}

const saveButtonStyle = {
  marginTop: '20px',
  background: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  padding: '12px 18px',
  cursor: 'pointer',
  fontWeight: 'bold',
}

function tabStyle(active) {
  return {
    background: active ? '#2563eb' : '#020617',
    color: 'white',
    border: '1px solid #334155',
    borderRadius: '10px',
    padding: '10px 14px',
    cursor: 'pointer',
    fontWeight: active ? 'bold' : 'normal',
  }
}