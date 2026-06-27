import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const OPERATIONS = [
  { key: 'ADJUSTMENT_PLUS',  label: 'Adjustment +' },
  { key: 'ADJUSTMENT_MINUS', label: 'Adjustment −' },
  { key: 'DISPENSE',         label: 'Dispense'      },
  { key: 'TRANSFER',         label: 'Transfer'      },
]

const ADJUSTMENT_REASONS = [
  { value: 'STOCK_CORRECTION',           label: 'Stock correction'           },
  { value: 'EXPIRED',                    label: 'Expired'                    },
  { value: 'DAMAGED',                    label: 'Damaged'                    },
  { value: 'LOST',                       label: 'Lost'                       },
  { value: 'FOUND',                      label: 'Found'                      },
  { value: 'OPENING_BALANCE_CORRECTION', label: 'Opening balance correction' },
]

const TRANSFER_REASONS = [
  { value: 'LOW_STOCK',              label: 'Low stock'              },
  { value: 'OVERSTOCK_REBALANCING',  label: 'Overstock rebalancing'  },
  { value: 'EMERGENCY_REQUEST',      label: 'Emergency request'      },
  { value: 'ROUTINE_REPLENISHMENT',  label: 'Routine replenishment'  },
]

// ─── Guard function ────────────────────────────────────────────────────────────
// Single source of truth for all stock deduction validation.
// Returns { valid: true } or { valid: false, message: string }
function validateDeduction(currentStock, requestedQty, operationLabel) {
  if (!requestedQty || requestedQty <= 0) {
    return { valid: false, message: 'Please enter a valid quantity greater than zero.' }
  }
  const current = Number(currentStock || 0)
  if (requestedQty > current) {
    return {
      valid: false,
      message: `Insufficient stock. Requested: ${requestedQty.toLocaleString()} units. Available: ${current.toLocaleString()} units. ${operationLabel} cancelled.`,
    }
  }
  return { valid: true }
}

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
  const [messageType, setMessageType] = useState('success')

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
      ...new Set(
        (inventoryData || []).map((item) => item.drug_code).filter(Boolean)
      ),
    ]

    let drugMap = new Map()

    if (drugCodes.length > 0) {
      const { data: drugData } = await supabase
        .from('drug_master_reference')
        .select('drug_code, generic_name, brand_name, strength')
        .in('drug_code', drugCodes)

      drugMap = new Map(
        (drugData || []).map((drug) => [drug.drug_code, drug])
      )
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

  const selectedPharmacy    = pharmacies.find((p) => p.id === selectedPharmacyId)
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

  function showMessage(text, type = 'success') {
    setMessage(text)
    setMessageType(type)
  }

  async function insertTransaction({
    type,
    sourcePharmacyId = null,
    destinationPharmacyIdValue = null,
    qty,
    transactionNotes,
  }) {
    const { error } = await supabase.from('inventory_transactions').insert({
      organization_id:          selectedItem.organization_id,
      source_pharmacy_id:       sourcePharmacyId,
      destination_pharmacy_id:  destinationPharmacyIdValue,
      drug_code:                selectedItem.drug_code,
      quantity:                 qty,
      transaction_type:         type,
      notes:                    transactionNotes,
    })
    if (error) throw error
  }

  // ── Adjustment + ─────────────────────────────────────────────────────────────
  async function handleAdjustmentPlus() {
    const qty = Number(quantity)

    if (!selectedItem || qty <= 0) {
      showMessage('Please select a drug and enter a valid quantity greater than zero.', 'error')
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
          updated_at:   new Date().toISOString(),
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

      showMessage('Adjustment + saved successfully.')
      resetForm()
      await loadInventory(selectedPharmacyId)
    } catch (error) {
      console.error(error)
      showMessage(`Error: ${error.message}`, 'error')
    }

    setLoading(false)
  }

  // ── Adjustment − ─────────────────────────────────────────────────────────────
  async function handleAdjustmentMinus() {
    const qty = Number(quantity)

    if (!selectedItem) {
      showMessage('Please select a drug.', 'error')
      return
    }

    // NEGATIVE STOCK GUARD
    const guard = validateDeduction(selectedItem.quantity_on_hand, qty, 'Adjustment')
    if (!guard.valid) {
      showMessage(guard.message, 'error')
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
          updated_at:   new Date().toISOString(),
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

      showMessage('Adjustment − saved successfully.')
      resetForm()
      await loadInventory(selectedPharmacyId)
    } catch (error) {
      console.error(error)
      showMessage(`Error: ${error.message}`, 'error')
    }

    setLoading(false)
  }

  // ── Dispense ──────────────────────────────────────────────────────────────────
  async function handleDispense() {
    const qty = Number(quantity)

    if (!selectedItem) {
      showMessage('Please select a drug.', 'error')
      return
    }

    // NEGATIVE STOCK GUARD
    const guard = validateDeduction(selectedItem.quantity_on_hand, qty, 'Dispense')
    if (!guard.valid) {
      showMessage(guard.message, 'error')
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
          updated_at:   new Date().toISOString(),
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

      showMessage('Dispense saved successfully.')
      resetForm()
      await loadInventory(selectedPharmacyId)
    } catch (error) {
      console.error(error)
      showMessage(`Error: ${error.message}`, 'error')
    }

    setLoading(false)
  }

  // ── Transfer ──────────────────────────────────────────────────────────────────
  async function handleTransfer() {
    const qty = Number(quantity)

    if (!selectedItem) {
      showMessage('Please select a drug.', 'error')
      return
    }

    if (!destinationPharmacyId || selectedPharmacyId === destinationPharmacyId) {
      showMessage('Please select a different destination pharmacy.', 'error')
      return
    }

    // NEGATIVE STOCK GUARD
    const guard = validateDeduction(selectedItem.quantity_on_hand, qty, 'Transfer')
    if (!guard.valid) {
      showMessage(guard.message, 'error')
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
          updated_at:   new Date().toISOString(),
        })
        .eq('id', selectedItem.id)

      if (sourceError) throw sourceError

      const { data: destinationRows, error: destinationLoadError } =
        await supabase
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
            updated_at:   new Date().toISOString(),
          })
          .eq('id', destinationItem.id)

        if (destinationUpdateError) throw destinationUpdateError
      } else {
        const { error: destinationInsertError } = await supabase
          .from('inventory')
          .insert({
            organization_id:  selectedItem.organization_id,
            pharmacy_id:      destinationPharmacyId,
            drug_code:        selectedItem.drug_code,
            quantity_on_hand: qty,
            minimum_stock:    selectedItem.minimum_stock || 0,
            maximum_stock:    selectedItem.maximum_stock || 0,
            last_updated:     new Date().toISOString(),
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
          `Reason: ${reason || 'NOT_SPECIFIED'} | Transfer out: ${qty} units from ${selectedPharmacy?.name || 'source pharmacy'} to ${destinationPharmacy?.name || 'destination pharmacy'}`,
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

      showMessage('Transfer saved successfully.')
      resetForm()
      await loadInventory(selectedPharmacyId)
    } catch (error) {
      console.error('TRANSFER ERROR FULL:', error)
      showMessage(`Error: ${error.message}`, 'error')
    }

    setLoading(false)
  }

  async function handleSubmit() {
    if (operation === 'ADJUSTMENT_PLUS')  await handleAdjustmentPlus()
    if (operation === 'ADJUSTMENT_MINUS') await handleAdjustmentMinus()
    if (operation === 'DISPENSE')         await handleDispense()
    if (operation === 'TRANSFER')         await handleTransfer()
  }

  const showReasonField = operation !== 'DISPENSE'
  const reasonOptions   = operation === 'TRANSFER' ? TRANSFER_REASONS : ADJUSTMENT_REASONS

  return (
    <div>
      <div className="fm-page-header">
        <div className="fm-page-header-top">
          <div>
            <div className="fm-page-header-meta">Operations</div>
            <h1 className="fm-page-header-title">Inventory operations</h1>
            <p className="fm-page-header-desc">
              Record adjustments, dispense events, and inter-pharmacy
              transfers with full transaction logging.
            </p>
          </div>
        </div>
      </div>

      <div className="fm-card">
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '24px',
            flexWrap: 'wrap',
            paddingBottom: '16px',
            borderBottom: '1px solid var(--color-border-subtle)',
          }}
        >
          {OPERATIONS.map((op) => (
            <button
              key={op.key}
              onClick={() => {
                setOperation(op.key)
                setMessage('')
                setReason('')
              }}
              className="fm-btn"
              style={
                operation === op.key
                  ? {
                      background:  'var(--color-primary)',
                      borderColor: 'var(--color-primary)',
                      color:       '#fff',
                      fontWeight:  'var(--font-medium)',
                    }
                  : {}
              }
            >
              {op.label}
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '16px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'grid', gap: '5px' }}>
            <label style={fieldLabelStyle}>
              {operation === 'TRANSFER' ? 'Source pharmacy' : 'Pharmacy'}
            </label>
            <select
              value={selectedPharmacyId}
              onChange={(e) => handlePharmacyChange(e.target.value)}
              style={selectStyle}
            >
              {pharmacies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </div>

          {operation === 'TRANSFER' && (
            <div style={{ display: 'grid', gap: '5px' }}>
              <label style={fieldLabelStyle}>Destination pharmacy</label>
              <select
                value={destinationPharmacyId}
                onChange={(e) => setDestinationPharmacyId(e.target.value)}
                style={selectStyle}
              >
                {pharmacies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gap: '5px' }}>
            <label style={fieldLabelStyle}>Drug</label>
            <select
              value={selectedInventoryId}
              onChange={(e) => setSelectedInventoryId(e.target.value)}
              style={selectStyle}
            >
              {inventory.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.drug?.brand_name || item.drug_code} —{' '}
                  {item.drug?.generic_name || ''} — Stock:{' '}
                  {item.quantity_on_hand}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gap: '5px' }}>
            <label style={fieldLabelStyle}>Quantity</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              style={selectStyle}
            />
          </div>

          {showReasonField && (
            <div style={{ display: 'grid', gap: '5px' }}>
              <label style={fieldLabelStyle}>Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={selectStyle}
              >
                <option value="">Select reason</option>
                {reasonOptions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {selectedItem && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '10px',
              marginBottom: '16px',
              padding: '14px',
              background: 'var(--color-bg-content)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <StockInfoItem
              label="Drug code"
              value={selectedItem.drug_code}
              mono
            />
            <StockInfoItem
              label="Current stock"
              value={Number(selectedItem.quantity_on_hand || 0).toLocaleString()}
              highlight
            />
            <StockInfoItem
              label="Minimum"
              value={Number(selectedItem.minimum_stock || 0).toLocaleString()}
            />
            <StockInfoItem
              label="Maximum"
              value={Number(selectedItem.maximum_stock || 0).toLocaleString()}
            />
          </div>
        )}

        <div style={{ display: 'grid', gap: '5px', marginBottom: '20px' }}>
          <label style={fieldLabelStyle}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes for this operation..."
            style={{ ...selectStyle, minHeight: '80px', resize: 'vertical' }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="fm-btn fm-btn-primary"
            style={{ opacity: loading ? 0.6 : 1, padding: '8px 20px' }}
          >
            {loading ? 'Saving...' : 'Save operation'}
          </button>

          {message && (
            <span
              style={{
                fontSize:   'var(--text-sm)',
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
    </div>
  )
}

function StockInfoItem({ label, value, mono, highlight }) {
  return (
    <div>
      <div
        style={{
          fontSize:      'var(--text-xs)',
          color:         'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom:  '3px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize:   'var(--text-base)',
          fontWeight: 'var(--font-medium)',
          color:      highlight
            ? 'var(--color-text-accent)'
            : 'var(--color-text-primary)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
        }}
      >
        {value || '—'}
      </div>
    </div>
  )
}

const fieldLabelStyle = {
  fontSize:      'var(--text-xs)',
  color:         'var(--color-text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const selectStyle = {
  width:       '100%',
  padding:     '8px 12px',
  borderRadius:'var(--radius-md)',
  border:      '1px solid var(--color-border-default)',
  background:  'var(--color-bg-input)',
  color:       'var(--color-text-primary)',
  fontSize:    'var(--text-base)',
  fontFamily:  'var(--font-sans)',
  boxSizing:   'border-box',
}
