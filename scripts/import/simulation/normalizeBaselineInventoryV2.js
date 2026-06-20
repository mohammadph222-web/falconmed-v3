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
  if (value.includes('PED')) return 'PEDIATRIC'
  if (value.includes('FRN') || value.includes('RETAIL')) return 'RETAIL'
  if (value.includes('DIAL')) return 'DIALYSIS'
  if (value.includes('CARD')) return 'CARDIOLOGY'
  if (value.includes('DAY') || value.includes('AMB')) return 'AMBULATORY'
  if (value.includes('MAIN')) return 'MAIN'

  return 'GENERAL'
}

function quantityByLogic(unitCost, group) {
  if (unitCost >= 1000) {
    if (group === 'ONCOLOGY') return randomInt(1, 4)
    if (group === 'MAIN') return randomInt(1, 5)
    return randomInt(1, 3)
  }

  if (unitCost >= 500) return randomInt(1, 8)
  if (unitCost >= 100) return randomInt(2, 20)
  if (unitCost >= 20) return randomInt(5, 80)

  if (group === 'MAIN') return randomInt(50, 600)
  if (group === 'RETAIL') return randomInt(20, 250)
  if (group === 'ICU' || group === 'ER') return randomInt(10, 150)
  if (group === 'ONCOLOGY') return randomInt(5, 120)

  return randomInt(10, 250)
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

async function normalizeV2() {
  console.log('Starting FalconMed Baseline Normalization V2...')

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
    const group = getPharmacyGroup(pharmacy?.code, pharmacy?.pharmacy_type)

    const unitCost = Number(item.unit_cost || 0)
    const quantity = quantityByLogic(unitCost, group)

    const minimumStock = Math.max(1, Math.floor(quantity * 0.25))
    const maximumStock = Math.max(minimumStock + 3, Math.floor(quantity * 1.8))

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
  console.log('Baseline normalization V2 completed successfully.')
}

normalizeV2().catch((error) => {
  console.error('Baseline normalization V2 failed:')
  console.error(error)
})