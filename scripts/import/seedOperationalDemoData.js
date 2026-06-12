import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

const organizationId = 'cf0e96fc-a52a-4934-ac81-8fe0eab3aeb9'

const PATIENT_COUNT = 20
const INVENTORY_RECORDS_PER_PHARMACY = 120

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function futureDate(daysFromNow) {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  return date.toISOString().split('T')[0]
}

const firstNames = [
  'Ahmed',
  'Mohammed',
  'Omar',
  'Ali',
  'Sara',
  'Fatima',
  'Noor',
  'Layla',
]

const lastNames = [
  'Hassan',
  'Yousef',
  'Khaled',
  'Mahmoud',
  'Rahman',
  'Saleh',
]

const insurances = ['Thiqa', 'Daman', 'Basic', 'NAS']

async function seedPatients() {
  console.log('Checking demo patients...')

  const { data: existingPatients, error: existingError } = await supabase
    .from('patients')
    .select('mrn')
    .like('mrn', 'DEMO-%')

  if (existingError) {
    console.error('Failed to check existing patients:', existingError.message)
    return
  }

  const existingMrns = new Set((existingPatients || []).map((p) => p.mrn))

  const patients = []

  for (let i = 1; i <= PATIENT_COUNT; i++) {
    const mrn = `DEMO-${String(i).padStart(6, '0')}`

    if (existingMrns.has(mrn)) continue

    const first = randomItem(firstNames)
    const last = randomItem(lastNames)

    patients.push({
      organization_id: organizationId,
      mrn,
      first_name: first,
      middle_name: 'Demo',
      last_name: last,
      patient_name: `${first} Demo ${last}`,
      gender: Math.random() > 0.5 ? 'Male' : 'Female',
      date_of_birth: '1990-01-01',
      mobile: `050${randomNumber(1000000, 9999999)}`,
      insurance_provider: randomItem(insurances),
      weight_kg: randomNumber(50, 100),
      height_cm: randomNumber(150, 190),
      allergies: 'No Known Drug Allergies',
      chronic_conditions: 'None',
      patient_status: 'ACTIVE',
    })
  }

  if (patients.length === 0) {
    console.log('No new patients needed.')
    return
  }

  const { data, error } = await supabase
    .from('patients')
    .insert(patients)
    .select()

  if (error) {
    console.error('Patient insert failed:', error.message)
    return
  }

  console.log(`Inserted ${data.length} patients`)
}

async function seedInventory() {
  console.log('Loading pharmacies...')

  const { data: pharmacies, error: pharmacyError } = await supabase
    .from('pharmacies')
    .select('id, code, name')
    .eq('is_active', true)

  if (pharmacyError) {
    console.error('Failed to load pharmacies:', pharmacyError.message)
    return
  }

  console.log(`Loaded ${pharmacies.length} pharmacies`)

  console.log('Loading drug master sample...')

  const { data: drugs, error: drugError } = await supabase
    .from('drug_master_reference')
    .select('drug_code, generic_name, brand_name, strength, dosage_form, unit_price_to_pharmacy')
    .not('drug_code', 'is', null)
    .limit(1000)

  if (drugError) {
    console.error('Failed to load drug master:', drugError.message)
    return
  }

  if (!drugs?.length) {
    console.error('No drugs found in drug_master_reference.')
    return
  }

  console.log(`Loaded ${drugs.length} drugs`)

  const inventoryRows = []

  for (const pharmacy of pharmacies) {
    const usedCodes = new Set()

    for (let i = 0; i < INVENTORY_RECORDS_PER_PHARMACY; i++) {
      let drug = randomItem(drugs)

      let attempts = 0
      while (usedCodes.has(drug.drug_code) && attempts < 20) {
        drug = randomItem(drugs)
        attempts++
      }

      usedCodes.add(drug.drug_code)

      const scenario = randomNumber(1, 100)

      let quantity = randomNumber(30, 300)
      let minimumStock = randomNumber(10, 50)
      let expiryDays = randomNumber(180, 720)
      let status = 'ACTIVE'

      if (scenario <= 5) {
        quantity = 0
      } else if (scenario <= 15) {
        quantity = randomNumber(1, minimumStock)
      }

      if (scenario > 15 && scenario <= 25) {
        expiryDays = randomNumber(-120, -1)
        status = 'EXPIRED'
      } else if (scenario > 25 && scenario <= 40) {
        expiryDays = randomNumber(1, 30)
      } else if (scenario > 40 && scenario <= 60) {
        expiryDays = randomNumber(31, 90)
      }

      inventoryRows.push({
        organization_id: organizationId,
        pharmacy_id: pharmacy.id,
        drug_code: drug.drug_code,

        quantity_on_hand: quantity,
        minimum_stock: minimumStock,
        maximum_stock: randomNumber(300, 1000),

        batch_number: `BATCH-${pharmacy.code}-${String(i + 1).padStart(4, '0')}`,
        expiry_date: futureDate(expiryDays),

        unit_cost: Number(drug.unit_price_to_pharmacy || 0),
        storage_location: randomItem(['MAIN STORE', 'FRIDGE', 'CONTROLLED ROOM', 'FAST MOVING']),
        inventory_status: status,

        last_updated: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }
  }

  console.log(`Prepared ${inventoryRows.length} inventory rows`)

  const chunkSize = 500

  for (let i = 0; i < inventoryRows.length; i += chunkSize) {
    const chunk = inventoryRows.slice(i, i + chunkSize)

    const { error } = await supabase.from('inventory').insert(chunk)

    if (error) {
      console.error('Inventory insert failed:', error.message)
      return
    }

    console.log(`Inserted inventory rows ${i + 1} - ${i + chunk.length}`)
  }

  console.log('Inventory seed completed.')
}

async function main() {
  console.log('Starting FalconMed operational demo seed...')

  await seedPatients()
  await seedInventory()

  console.log('Seed completed.')
}

main()