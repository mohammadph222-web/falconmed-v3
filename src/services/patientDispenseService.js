import { supabase } from '../lib/supabase'

export async function dispenseMedicationToPatient({
  patientId,
  pharmacyId,
  inventoryId,
  quantity,
  directions = '',
  durationDays = null,
  prescribingDoctor = '',
  indication = '',
  createdBy = null,
}) {
  const qty = Number(quantity)

  if (!patientId) throw new Error('Patient is required.')
  if (!pharmacyId) throw new Error('Pharmacy is required.')
  if (!inventoryId) throw new Error('Drug is required.')
  if (!qty || qty <= 0) throw new Error('Quantity must be greater than zero.')

  const { data: inventoryItem, error: inventoryError } = await supabase
    .from('inventory')
    .select('*')
    .eq('id', inventoryId)
    .eq('pharmacy_id', pharmacyId)
    .single()

  if (inventoryError || !inventoryItem) {
    throw new Error(`Inventory item not found: ${inventoryError?.message || ''}`)
  }

  const oldQty = Number(inventoryItem.quantity_on_hand || 0)

  if (oldQty < qty) {
    throw new Error('Not enough stock to dispense.')
  }

  const { data: drug, error: drugError } = await supabase
    .from('drug_master_reference')
    .select('drug_code, generic_name, brand_name, strength, dosage_form')
    .eq('drug_code', inventoryItem.drug_code)
    .maybeSingle()

  if (drugError) {
    throw new Error(`Drug master error: ${drugError.message}`)
  }

  const newQty = oldQty - qty
  const now = new Date().toISOString()

  const rollbackInventory = async () => {
    await supabase
      .from('inventory')
      .update({
        quantity_on_hand: oldQty,
        last_updated: now,
        updated_at: now,
      })
      .eq('id', inventoryItem.id)
  }

  const { error: updateError } = await supabase
    .from('inventory')
    .update({
      quantity_on_hand: newQty,
      last_updated: now,
      updated_at: now,
    })
    .eq('id', inventoryItem.id)

  if (updateError) {
    throw new Error(`Inventory update failed: ${updateError.message}`)
  }

  const { data: transaction, error: transactionError } = await supabase
    .from('inventory_transactions')
    .insert({
      organization_id: inventoryItem.organization_id,
      source_pharmacy_id: pharmacyId,
      destination_pharmacy_id: null,
      drug_code: inventoryItem.drug_code,
      quantity: qty,
      transaction_type: 'DISPENSE',
      notes: `Patient dispense: ${qty} units`,
    })
    .select()
    .single()

  if (transactionError) {
    await rollbackInventory()
    throw new Error(`Transaction insert failed: ${transactionError.message}`)
  }

  const { data: history, error: historyError } = await supabase
    .from('patient_medication_history')
    .insert({
      patient_id: patientId,
      pharmacy_id: pharmacyId,

      drug_code: inventoryItem.drug_code,
      generic_name: drug?.generic_name || null,
      brand_name: drug?.brand_name || null,
      strength: drug?.strength || null,
      dosage_form: drug?.dosage_form || null,

      quantity: qty,
      unit: 'unit',

      directions: directions || null,
      duration_days: durationDays ? Number(durationDays) : null,
      prescribing_doctor: prescribingDoctor || null,
      indication: indication || null,

      inventory_transaction_id: transaction.id,
      created_by: createdBy,
    })
    .select()
    .single()

  if (historyError) {
    await rollbackInventory()

    await supabase
      .from('inventory_transactions')
      .delete()
      .eq('id', transaction.id)

    throw new Error(`Medication history insert failed: ${historyError.message}`)
  }
const { error: dispenseHistoryError } = await supabase
  .from('patient_dispense_history')
  .insert({
    patient_id: patientId,
    pharmacy_id: pharmacyId,
    drug_code: inventoryItem.drug_code,
    generic_name: drug?.generic_name || null,
    brand_name: drug?.brand_name || null,
    strength: drug?.strength || null,
    quantity_dispensed: qty,
    dispense_date: now,
    dispensed_by: createdBy || 'FalconMed Patient Dispense',
    transaction_id: transaction.id,
    notes: `Patient dispense: ${qty} units`,
  })

if (dispenseHistoryError) {
  await rollbackInventory()

  await supabase
    .from('inventory_transactions')
    .delete()
    .eq('id', transaction.id)

  await supabase
    .from('patient_medication_history')
    .delete()
    .eq('id', history.id)

  throw new Error(
    `Patient dispense history insert failed: ${dispenseHistoryError.message}`
  )
}

  return {
    success: true,
    inventory: {
      id: inventoryItem.id,
      old_quantity: oldQty,
      new_quantity: newQty,
    },
    transaction,
    history,
  }
}

export async function getPatientMedicationHistory(patientId) {
  if (!patientId) {
    throw new Error('Patient is required.')
  }

  const { data, error } = await supabase
    .from('patient_medication_history')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to load medication history: ${error.message}`)
  }

  return data || []
}