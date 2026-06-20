import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const BATCH_SIZE = 500

const ADDITIONS_BY_CODE = {
  MAIN: 1200,
  'FGH-MAIN': 1000,
  'FSC-ONC': 700,
  'FSC-DAY': 400,
  'FSC-DIAL': 300,
  'FSC-CARD': 300,
  'FGH-ICU': 300,
  'FGH-ER': 250,
}

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

function cleanGenericName(name = '') {
  return name
    .toString()
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

function quantityRangeByCode(code) {
  if (code === 'MAIN') return [500, 4000]
  if (code === 'FGH-MAIN') return [150, 1200]
  if (code === 'FSC-ONC') return [5, 150]
  if (code === 'FGH-ICU') return [30, 400]
  if (code === 'FGH-ER') return [30, 400]
  if (code === 'FSC-DIAL') return [20, 300]
  if (code === 'FSC-CARD') return [20, 300]
  if (code === 'FSC-DAY') return [20, 300]

  return [20, 300]
}

function unitCostByCode(code) {
  if (code === 'FSC-ONC') {
    if (Math.random() < 0.35) return randomFloat(1000, 7000)
    return randomFloat(100, 999)
  }

  if (code === 'MAIN' || code === 'FGH-MAIN') {
    if (Math.random() < 0.08) return randomFloat(1000, 5000)
    if (Math.random() < 0.15) return randomFloat(350, 999)
    return randomFloat(1, 350)
  }

  if (Math.random() < 0.04) return randomFloat(1000, 4000)
  if (Math.random() < 0.12) return randomFloat(350, 999)

  return randomFloat(1, 350)
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

async function enhanceBaselineInventory() {
  console.log('Starting FalconMed Baseline Enhancement...')

  const pharmacies = await loadAllRows('pharmacies', '*')
  const drugs = await loadAllRows(
    'drug_master_reference',
    'drug_code, generic_name, brand_name, strength, dosage_form'
  )

  const organizationId = pharmacies[0]?.organization_id

  if (!organizationId) {
    throw new Error('Organization ID not found.')
  }

  const existingInventory = await loadAllRows(
    'inventory',
    'pharmacy_id, drug_code'
  )

  const usedDrugByPharmacy = new Map()

  for (const item of existingInventory) {
    if (!usedDrugByPharmacy.has(item.pharmacy_id)) {
      usedDrugByPharmacy.set(item.pharmacy_id, new Set())
    }

    usedDrugByPharmacy.get(item.pharmacy_id).add(item.drug_code)
  }

  const rowsToInsert = []
  let index = 1

  for (const [code, targetCount] of Object.entries(ADDITIONS_BY_CODE)) {
    const pharmacy = pharmacies.find((p) => p.code === code)

    if (!pharmacy) {
      console.warn(`Pharmacy not found for code: ${code}`)
      continue
    }

    console.log(`Preparing ${targetCount} rows for ${code}...`)

    if (!usedDrugByPharmacy.has(pharmacy.id)) {
      usedDrugByPharmacy.set(pharmacy.id, new Set())
    }

    const usedSet = usedDrugByPharmacy.get(pharmacy.id)

    let added = 0
    let attempts = 0

    while (added < targetCount && attempts < targetCount * 50) {
      attempts++

      const drug = drugs[randomInt(0, drugs.length - 1)]
      const genericKey = cleanGenericName(
        drug.generic_name || drug.brand_name || drug.drug_code
      )

      const uniqueKey = `${drug.drug_code}-${genericKey}`

      if (usedSet.has(uniqueKey) || usedSet.has(drug.drug_code)) {
        continue
      }

      usedSet.add(uniqueKey)
      usedSet.add(drug.drug_code)

      const [minQty, maxQty] = quantityRangeByCode(code)
      const quantity = randomInt(minQty, maxQty)

      const minimumStock = Math.max(
        5,
        Math.floor(quantity * randomFloat(0.08, 0.25))
      )

      const maximumStock = Math.max(
        minimumStock + 10,
        Math.floor(quantity * randomFloat(1.5, 3.5))
      )

      const unitCost = unitCostByCode(code)

      rowsToInsert.push({
        id: crypto.randomUUID(),
        organization_id: organizationId,
        pharmacy_id: pharmacy.id,
        drug_code: drug.drug_code,
        quantity_on_hand: quantity,
        minimum_stock: minimumStock,
        maximum_stock: maximumStock,
        batch_number: `ENH-${code}-${String(index).padStart(5, '0')}`,
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

      added++
      index++
    }

    console.log(`Prepared ${added} rows for ${code}`)
  }

  console.log(`Total rows prepared: ${rowsToInsert.length}`)

  for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
    const batch = rowsToInsert.slice(i, i + BATCH_SIZE)

    const { error } = await supabase.from('inventory').insert(batch)

    if (error) {
      console.error('Insert error:', error)
      throw error
    }

    console.log(`Inserted rows ${i + 1} - ${i + batch.length}`)
  }

  console.log('Baseline enhancement completed successfully.')
}

enhanceBaselineInventory().catch((error) => {
  console.error('Baseline enhancement failed:')
  console.error(error)
})