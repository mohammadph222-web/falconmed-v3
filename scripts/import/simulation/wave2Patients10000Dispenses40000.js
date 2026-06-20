import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const TARGET_PATIENTS = 10000
const TARGET_DISPENSES = 40000
const BATCH_SIZE = 500

const maleNames = ['Ahmed', 'Mohammad', 'Omar', 'Ali', 'Yousef', 'Khaled', 'Hassan', 'Sami']
const femaleNames = ['Fatima', 'Aisha', 'Mariam', 'Sara', 'Noora', 'Layla', 'Huda', 'Rana']
const middleNames = ['Mohammad', 'Ali', 'Hassan', 'Omar', 'Khaled', 'Saeed']
const lastNames = ['Al Mansoori', 'Al Hammadi', 'Saleh', 'Haddad', 'Khalil', 'Nasser', 'Rahman']
const insuranceProviders = ['Thiqa', 'Daman', 'Inayah Insurance', 'NAS', 'ADNIC', 'Self Pay']
const conditions = ['None', 'Diabetes', 'Hypertension', 'Asthma', 'Cardiac Disease', 'CKD']

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick(list) {
  return list[randomInt(0, list.length - 1)]
}

async function loadAllRows(tableName, selectColumns) {
  let allRows = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select(selectColumns)
      .range(from, from + pageSize - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    allRows = [...allRows, ...data]
    if (data.length < pageSize) break
    from += pageSize
  }

  return allRows
}

function randomDOB() {
  const age = randomInt(1, 90)
  const year = new Date().getFullYear() - age
  return `${year}-${String(randomInt(1, 12)).padStart(2, '0')}-${String(randomInt(1, 28)).padStart(2, '0')}`
}

function randomMobile(index) {
  return `05${String(30000000 + index).slice(0, 8)}`
}

function randomDispenseDate() {
  const today = new Date()
  const daysBack = randomInt(1, 365)
  today.setDate(today.getDate() - daysBack)
  return today.toISOString()
}

function quantityByCost(unitCost) {
  if (unitCost >= 1000) return 1
  if (unitCost >= 100) return randomInt(1, 3)
  return randomInt(1, 5)
}

async function seedPatientsTo10000() {
  const organizations = await loadAllRows('organizations', 'id')
  const organizationId = organizations[0]?.id
  if (!organizationId) throw new Error('No organization found.')

  const existing = await loadAllRows('patients', 'id')
  const existingCount = existing.length

  console.log(`Existing patients: ${existingCount}`)

  if (existingCount >= TARGET_PATIENTS) return

  const needed = TARGET_PATIENTS - existingCount
  const rows = []

  for (let i = 1; i <= needed; i++) {
    const index = existingCount + i
    const gender = Math.random() < 0.52 ? 'Male' : 'Female'
    const firstName = gender === 'Male' ? pick(maleNames) : pick(femaleNames)
    const middleName = pick(middleNames)
    const lastName = pick(lastNames)

    rows.push({
      id: crypto.randomUUID(),
      organization_id: organizationId,
      mrn: `MRN-2026-${String(index).padStart(6, '0')}`,
      patient_name: `${firstName} ${middleName} ${lastName}`,
      gender,
      date_of_birth: randomDOB(),
      mobile: randomMobile(index),
      email: null,
      address: 'Al Ain, UAE',
      insurance_provider: pick(insuranceProviders),
      insurance_number: `INS-${String(900000 + index)}`,
      weight_kg: randomInt(8, 110),
      height_cm: randomInt(60, 190),
      allergies: 'No Known Drug Allergies',
      chronic_conditions: pick(conditions),
      notes: null,
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      patient_status: 'Active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  console.log(`Prepared new patients: ${rows.length}`)

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('patients').insert(batch)
    if (error) throw error
    console.log(`Inserted patients ${i + 1} - ${i + batch.length}`)
  }
}

async function generateDispensesTo40000() {
  const existingDispenses = await loadAllRows('patient_dispense_history', 'id')
  const existingCount = existingDispenses.length

  console.log(`Existing dispense events: ${existingCount}`)

  if (existingCount >= TARGET_DISPENSES) return

  const needed = TARGET_DISPENSES - existingCount

  const patients = await loadAllRows('patients', 'id, chronic_conditions')
  const inventory = await loadAllRows(
    'inventory',
    'id, pharmacy_id, drug_code, quantity_on_hand, unit_cost'
  )
  const drugs = await loadAllRows(
    'drug_master_reference',
    'drug_code, generic_name, brand_name, strength, dosage_form'
  )

  const drugMap = new Map(drugs.map((d) => [d.drug_code, d]))

  const usableInventory = inventory
    .map((i) => ({
      ...i,
      quantity_on_hand: Number(i.quantity_on_hand || 0),
      unit_cost: Number(i.unit_cost || 0),
    }))
    .filter((i) => i.quantity_on_hand > 5)

  const dispenseRows = []
  const medRows = []
  const deductionMap = new Map()

  let attempts = 0

  while (dispenseRows.length < needed && attempts < needed * 30) {
    attempts++

    const patient = pick(patients)
    const item = pick(usableInventory)

    if (item.unit_cost >= 1000 && Math.random() < 0.9) continue

    const drug = drugMap.get(item.drug_code)
    if (!drug) continue

    const qty = quantityByCost(item.unit_cost)
    if (item.quantity_on_hand < qty) continue

    item.quantity_on_hand -= qty
    deductionMap.set(item.id, (deductionMap.get(item.id) || 0) + qty)

    const date = randomDispenseDate()
    const dispenseId = crypto.randomUUID()

    dispenseRows.push({
      id: dispenseId,
      patient_id: patient.id,
      pharmacy_id: item.pharmacy_id,
      drug_code: item.drug_code,
      generic_name: drug.generic_name || null,
      brand_name: drug.brand_name || null,
      strength: drug.strength || null,
      quantity_dispensed: qty,
      dispense_date: date,
      dispensed_by: null,
      transaction_id: null,
      notes: 'Wave 2 operational simulation',
      created_at: date,
    })

    medRows.push({
      id: crypto.randomUUID(),
      patient_id: patient.id,
      pharmacy_id: item.pharmacy_id,
      drug_code: item.drug_code,
      generic_name: drug.generic_name || null,
      brand_name: drug.brand_name || null,
      strength: drug.strength || null,
      dosage_form: drug.dosage_form || null,
      quantity: qty,
      unit: 'unit',
      directions: 'Use as prescribed',
      duration_days: randomInt(30, 90),
      prescribing_doctor: pick(['Dr. Ahmed', 'Dr. Sara', 'Dr. Khalid', 'Dr. Mariam']),
      indication: patient.chronic_conditions || 'General therapy',
      inventory_transaction_id: null,
      created_at: date,
      created_by: null,
    })
  }

  console.log(`Prepared dispense rows: ${dispenseRows.length}`)
  console.log(`Prepared medication rows: ${medRows.length}`)

  for (let i = 0; i < dispenseRows.length; i += BATCH_SIZE) {
    const batch = dispenseRows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('patient_dispense_history').insert(batch)
    if (error) throw error
    console.log(`Inserted dispense rows ${i + 1} - ${i + batch.length}`)
  }

  for (let i = 0; i < medRows.length; i += BATCH_SIZE) {
    const batch = medRows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('patient_medication_history').insert(batch)
    if (error) throw error
    console.log(`Inserted medication rows ${i + 1} - ${i + batch.length}`)
  }

  console.log(`Updating inventory quantities for ${deductionMap.size} rows...`)

  let updated = 0
  for (const [inventoryId, deductedQty] of deductionMap.entries()) {
    const original = inventory.find((i) => i.id === inventoryId)
    if (!original) continue

    const newQty = Math.max(0, Number(original.quantity_on_hand || 0) - deductedQty)

    const { error } = await supabase
      .from('inventory')
      .update({
        quantity_on_hand: newQty,
        updated_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      })
      .eq('id', inventoryId)

    if (error) throw error

    updated++
    if (updated % 500 === 0) console.log(`Updated inventory rows: ${updated}`)
  }

  console.log(`Updated inventory rows: ${updated}`)
}

async function runWave2() {
  console.log('Starting Wave 2: 10,000 Patients + 40,000 Dispenses')

  await seedPatientsTo10000()
  await generateDispensesTo40000()

  console.log('Wave 2 completed successfully.')
}

runWave2().catch((error) => {
  console.error('Wave 2 failed:')
  console.error(error)
})