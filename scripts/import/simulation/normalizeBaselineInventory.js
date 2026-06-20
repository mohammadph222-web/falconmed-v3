import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick(list) {
  return list[randomInt(0, list.length - 1)]
}

function getPharmacyGroup(code = '', type = '') {
  const value = `${code} ${type}`.toUpperCase()

  if (value.includes('ONC')) return 'ONCOLOGY'
  if (value.includes('ICU')) return 'ICU'
  if (value.includes('ER') || value.includes('EMERGENCY')) return 'ER'
  if (value.includes('OR')) return 'OR'
  if (value.includes('FRN') || value.includes('RETAIL')) return 'RETAIL'
  if (value.includes('DIAL')) return 'DIALYSIS'
  if (value.includes('CARD')) return 'CARDIOLOGY'
  if (value.includes('MAIN')) return 'MAIN'

  return 'GENERAL'
}

function quantityByLogic(unitCost, pharmacyGroup) {
  if (unitCost >= 1000) return randomInt(1, 20)

  if (unitCost >= 100) {
    if (pharmacyGroup === 'MAIN') return randomInt(20, 150)
    if (pharmacyGroup === 'ONCOLOGY') return randomInt(5, 80)
    if (pharmacyGroup === 'ICU' || pharmacyGroup === 'ER') return randomInt(10, 80)
    if (pharmacyGroup === 'RETAIL') return randomInt(5, 60)
    return randomInt(10, 100)
  }

  if (pharmacyGroup === 'MAIN') return randomInt(200, 3000)
  if (pharmacyGroup === 'ONCOLOGY') return randomInt(10, 300)
  if (pharmacyGroup === 'ICU' || pharmacyGroup === 'ER') return randomInt(10, 300)
  if (pharmacyGroup === 'RETAIL') return randomInt(20, 500)
  if (pharmacyGroup === 'DIALYSIS' || pharmacyGroup === 'CARDIOLOGY') return randomInt(20, 500)

  return randomInt(20, 700)
}

function storageByLogic(unitCost) {
  if (unitCost >= 1000) return 'HIGH VALUE CABINET'
  return pick(['MAIN STORE', 'FRIDGE', 'CONTROLLED ROOM', 'SHELF A', 'SHELF B'])
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

async function normalizeBaselineInventory() {
  console.log('Starting FalconMed Baseline Normalization...')

  const pharmacies = await loadAllRows('pharmacies', 'id, code, pharmacy_type')
  const pharmacyMap = new Map(pharmacies.map((p) => [p.id, p]))

  const inventory = await loadAllRows(
    'inventory',
    'id, pharmacy_id, unit_cost'
  )

  console.log(`Loaded inventory rows: ${inventory.length}`)

  for (let i = 0; i < inventory.length; i++) {
    const item = inventory[i]

    const pharmacy = pharmacyMap.get(item.pharmacy_id)
    const pharmacyGroup = getPharmacyGroup(pharmacy?.code, pharmacy?.pharmacy_type)

    const unitCost = Number(item.unit_cost || 0)
    const quantity = quantityByLogic(unitCost, pharmacyGroup)

    const minimumStock = Math.max(1, Math.floor(quantity * 0.2))
    const maximumStock = Math.max(minimumStock + 5, Math.floor(quantity * 2))

    const { error } = await supabase
      .from('inventory')
      .update({
        quantity_on_hand: quantity,
        minimum_stock: minimumStock,
        maximum_stock: maximumStock,
        storage_location: storageByLogic(unitCost),
        updated_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      })
      .eq('id', item.id)

    if (error) {
      console.error('Update error:', error)
      throw error
    }

    if ((i + 1) % 500 === 0) {
      console.log(`Updated ${i + 1} rows`)
    }
  }

  console.log(`Updated ${inventory.length} rows`)
  console.log('Baseline normalization completed successfully.')
}

normalizeBaselineInventory().catch((error) => {
  console.error('Baseline normalization failed:')
  console.error(error)
})