import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const TARGET_PATIENTS = 1000
const BATCH_SIZE = 500

const firstNamesMale = ['Ahmed', 'Mohammad', 'Omar', 'Ali', 'Yousef', 'Khaled', 'Hassan', 'Sami']
const firstNamesFemale = ['Fatima', 'Aisha', 'Mariam', 'Sara', 'Noora', 'Layla', 'Huda', 'Rana']
const middleNames = ['Mohammad', 'Ali', 'Hassan', 'Omar', 'Khaled', 'Saeed']
const lastNames = ['Al Mansoori', 'Al Hammadi', 'Saleh', 'Haddad', 'Khalil', 'Nasser', 'Rahman']

const insuranceProviders = ['Thiqa', 'Daman', 'Inayah Insurance', 'NAS', 'ADNIC', 'Self Pay']
const allergies = ['No Known Drug Allergies', 'Penicillin Allergy', 'NSAID Allergy', 'Sulfa Allergy']
const chronicConditions = ['None', 'Diabetes', 'Hypertension', 'Asthma', 'Cardiac Disease', 'CKD']

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick(list) {
  return list[randomInt(0, list.length - 1)]
}

function randomDateOfBirth() {
  const age = randomInt(1, 90)
  const year = new Date().getFullYear() - age
  const month = randomInt(1, 12)
  const day = randomInt(1, 28)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function randomMobile(index) {
  return `05${String(20000000 + index).slice(0, 8)}`
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

async function seedPatients1000() {
  console.log('Starting FalconMed Patient Population Builder...')

  const organizations = await loadAllRows('organizations', 'id')
  const organizationId = organizations[0]?.id

  if (!organizationId) {
    throw new Error('No organization found.')
  }

  const existingPatients = await loadAllRows('patients', 'id')
  const existingCount = existingPatients.length

  console.log(`Existing patients: ${existingCount}`)

  if (existingCount >= TARGET_PATIENTS) {
    console.log(`Patients already >= ${TARGET_PATIENTS}. No action needed.`)
    return
  }

  const rowsToCreate = []
  const needed = TARGET_PATIENTS - existingCount

  for (let i = 1; i <= needed; i++) {
    const index = existingCount + i
    const gender = Math.random() < 0.52 ? 'Male' : 'Female'

    const firstName = gender === 'Male' ? pick(firstNamesMale) : pick(firstNamesFemale)
    const middleName = pick(middleNames)
    const lastName = pick(lastNames)
    const patientName = `${firstName} ${middleName} ${lastName}`

    rowsToCreate.push({
      id: crypto.randomUUID(),
      organization_id: organizationId,
      mrn: `MRN-2026-${String(index).padStart(6, '0')}`,
      patient_name: patientName,
      gender,
      date_of_birth: randomDateOfBirth(),
      mobile: randomMobile(index),
      email: null,
      address: 'Al Ain, UAE',
      insurance_provider: pick(insuranceProviders),
      insurance_number: `INS-${String(900000 + index)}`,
      weight_kg: randomInt(8, 110),
      height_cm: randomInt(60, 190),
      allergies: pick(allergies),
      chronic_conditions: pick(chronicConditions),
      notes: null,
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      patient_status: 'Active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  console.log(`Prepared patients: ${rowsToCreate.length}`)

  for (let i = 0; i < rowsToCreate.length; i += BATCH_SIZE) {
    const batch = rowsToCreate.slice(i, i + BATCH_SIZE)

    const { error } = await supabase.from('patients').insert(batch)

    if (error) {
      console.error('Insert error:', error)
      throw error
    }

    console.log(`Inserted patients ${i + 1} - ${i + batch.length}`)
  }

  console.log('Patient population completed successfully.')
}

seedPatients1000().catch((error) => {
  console.error('Patient population failed:')
  console.error(error)
})