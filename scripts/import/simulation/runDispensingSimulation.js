import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const TARGET = 100

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function randomQty(qoh) {
  const max = Math.min(Number(qoh), 5)
  return Math.floor(Math.random() * max) + 1
}

async function main() {
  console.log('Starting Phase 6 Dispensing Simulation...')

  const { data: patients, error: patientError } = await supabase
    .from('patients')
    .select('id')
    .limit(100)

  if (patientError) throw patientError
  if (!patients.length) throw new Error('No patients found')

  const today = new Date().toISOString().slice(0, 10)

  const { data: inventory, error: inventoryError } = await supabase
    .from('inventory')
    .select('id, pharmacy_id, drug_code, quantity_on_hand, expiry_date, inventory_status')
    .gt('quantity_on_hand', 0)
    .gte('expiry_date', today)
    .eq('inventory_status', 'ACTIVE')
    .limit(1000)

  if (inventoryError) throw inventoryError
  if (!inventory.length) throw new Error('No eligible inventory found')

  let success = 0
  let failed = 0

  for (let i = 1; i <= TARGET; i++) {
    const patient = pickRandom(patients)

    const availableItems = inventory.filter(
      (item) => Number(item.quantity_on_hand) > 0
    )

    if (!availableItems.length) {
      console.log('No more available stock.')
      break
    }

    const item = pickRandom(availableItems)
    const qty = randomQty(item.quantity_on_hand)

    const { data, error } = await supabase.rpc('dispense_medication_atomic', {
      p_patient_id: patient.id,
      p_inventory_id: item.id,
      p_quantity: qty,
      p_created_by: null
    })

    if (error) {
      failed++
      console.error(`Failed ${i}:`, error.message)
      continue
    }

    item.quantity_on_hand = Number(item.quantity_on_hand) - qty
    success++

    console.log(
      `#${i} DISPENSED | ${data.drug_code} | Qty: ${qty} | Before: ${data.quantity_before} | After: ${data.quantity_after}`
    )
  }

  console.log('---------------------------')
  console.log('Phase 6 completed')
  console.log('Success:', success)
  console.log('Failed:', failed)
}

main().catch((error) => {
  console.error('Fatal error:', error.message)
  process.exit(1)
})