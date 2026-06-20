import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const TARGET_ROWS = 8000
const BATCH_SIZE = 500

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomFloat(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(2))
}

function randomExpiryDate() {
  const today = new Date()
  const daysToAdd = randomInt(30, 365 * 5)
  today.setDate(today.getDate() + daysToAdd)
  return today.toISOString().split('T')[0]
}

function randomReceivedDate() {
  const today = new Date()
  const daysBack = randomInt(1, 365)
  today.setDate(today.getDate() - daysBack)
  return today.toISOString().split('T')[0]
}

function randomStorageLocation() {
  const locations = [
    'MAIN STORE',
    'FRIDGE',
    'CONTROLLED ROOM',
    'SHELF A',
    'SHELF B',
    'HIGH VALUE CABINET',
  ]

  return locations[randomInt(0, locations.length - 1)]
}

function cleanGenericName(name = '') {
  return name
    .toString()
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function classifyPharmacy(pharmacy) {
  const name = (
    pharmacy.name ||
    pharmacy.pharmacy_name ||
    pharmacy.code ||
    pharmacy.pharmacy_code ||
    ''
  ).toLowerCase()

  if (name.includes('warehouse') || name.includes('store')) return 'WAREHOUSE'
  if (name.includes('icu')) return 'ICU'
  if (name.includes('er') || name.includes('emergency')) return 'ER'
  if (name.includes('or') || name.includes('operating')) return 'OR'
  if (name.includes('opd') || name.includes('outpatient')) return 'OUTPATIENT'
  if (name.includes('community') || name.includes('retail')) return 'COMMUNITY'
  if (name.includes('specialty') || name.includes('oncology')) return 'SPECIALTY'

  return 'GENERAL'
}

function getQuantityRange(type) {
  if (type === 'WAREHOUSE') return [500, 5000]
  if (type === 'ICU') return [20, 300]
  if (type === 'ER') return [20, 300]
  if (type === 'OR') return [20, 250]
  if (type === 'OUTPATIENT') return [30, 500]
  if (type === 'SPECIALTY') return [10, 250]
  if (type === 'COMMUNITY') return [10, 150]

  return [30, 400]
}

function createBatchNumber(pharmacyType, index) {
  const prefix = pharmacyType.slice(0, 4).toUpperCase()
  return `BASE-${prefix}-${String(index).padStart(5, '0')}`
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

async function clearTable(tableName) {
  console.log(`Clearing ${tableName}...`)

  const { error } = await supabase
    .from(tableName)
    .delete()
    .not('id', 'is', null)

  if (error) {
    console.error(`Failed clearing ${tableName}:`, error)
    throw error
  }
}

async function buildBaselineInventory() {
  console.log('Starting FalconMed Baseline Inventory Builder...')
  console.log(`Target rows: ${TARGET_ROWS}`)

  const pharmacies = await loadAllRows('pharmacies', '*')
  console.log(`Loaded pharmacies: ${pharmacies.length}`)

  if (!pharmacies.length) {
    throw new Error('No pharmacies found.')
  }

  const organizationId = pharmacies[0].organization_id

  const drugs = await loadAllRows(
    'drug_master_reference',
    'drug_code, generic_name, brand_name, strength, dosage_form'
  )

  console.log(`Loaded drug master rows: ${drugs.length}`)

  if (!drugs.length) {
    throw new Error('No drugs found in drug_master_reference.')
  }

  await clearTable('reconciliation_audit_trail')
  await clearTable('reconciliation_cases')
  await clearTable('stock_count_items')
  await clearTable('stock_count_sessions')
  await clearTable('inventory_transactions')
  await clearTable('inventory')

  const inventoryRows = []
  const usedGenericByPharmacy = new Map()

  let attempts = 0
  let index = 1

  while (inventoryRows.length < TARGET_ROWS && attempts < TARGET_ROWS * 30) {
    attempts++

    const pharmacy = pharmacies[randomInt(0, pharmacies.length - 1)]
    const pharmacyType = classifyPharmacy(pharmacy)

    const drug = drugs[randomInt(0, drugs.length - 1)]
    const genericKey = cleanGenericName(
      drug.generic_name || drug.brand_name || drug.drug_code
    )

    const pharmacyKey = pharmacy.id

    if (!usedGenericByPharmacy.has(pharmacyKey)) {
      usedGenericByPharmacy.set(pharmacyKey, new Set())
    }

    const usedSet = usedGenericByPharmacy.get(pharmacyKey)

    if (usedSet.has(genericKey)) {
      continue
    }

    usedSet.add(genericKey)

    const [minQty, maxQty] = getQuantityRange(pharmacyType)
    const quantity = randomInt(minQty, maxQty)

    const minimumStock = Math.max(
      5,
      Math.floor(quantity * randomFloat(0.08, 0.25))
    )

    const maximumStock = Math.max(
      minimumStock + 10,
      Math.floor(quantity * randomFloat(1.5, 3.5))
    )

    let unitCost = randomFloat(1, 350)

    if (Math.random() < 0.04) {
      unitCost = randomFloat(1000, 5000)
    } else if (Math.random() < 0.12) {
      unitCost = randomFloat(350, 999)
    }

    inventoryRows.push({
      id: crypto.randomUUID(),
      organization_id: organizationId,
      pharmacy_id: pharmacy.id,
      drug_code: drug.drug_code,
      quantity_on_hand: quantity,
      minimum_stock: minimumStock,
      maximum_stock: maximumStock,
      batch_number: createBatchNumber(pharmacyType, index),
      expiry_date: randomExpiryDate(),
      unit_cost: unitCost,
      purchase_price: unitCost,
      storage_location: randomStorageLocation(),
      inventory_status: 'ACTIVE',
      received_date: randomReceivedDate(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    })

    index++
  }

  console.log(`Prepared inventory rows: ${inventoryRows.length}`)

  for (let i = 0; i < inventoryRows.length; i += BATCH_SIZE) {
    const batch = inventoryRows.slice(i, i + BATCH_SIZE)

    const { error } = await supabase.from('inventory').insert(batch)

    if (error) {
      console.error('Insert error:', error)
      throw error
    }

    console.log(`Inserted rows ${i + 1} - ${i + batch.length}`)
  }

  console.log('Baseline inventory completed successfully.')
}

buildBaselineInventory().catch((error) => {
  console.error('Baseline inventory failed:')
  console.error(error)
})