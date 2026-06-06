import 'dotenv/config'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

const workbook = XLSX.readFile('./data/raw/doh_drug_master_raw.xlsx')
const sheetName = 'Drugs'
const drugSheet = workbook.Sheets[sheetName]

if (!drugSheet) {
  throw new Error(`Sheet "${sheetName}" not found`)
}

const jsonData = XLSX.utils.sheet_to_json(drugSheet)

function excelDateToJSDate(serial) {
  if (!serial || typeof serial !== 'number') return null
  const utcDays = Math.floor(serial - 25569)
  const utcValue = utcDays * 86400
  return new Date(utcValue * 1000).toISOString().split('T')[0]
}

function normalizeColumnName(column) {
  return column
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

const saltWords = [
  'besilate',
  'maleate',
  'calcium',
  'sodium',
  'potassium',
  'hydrochloride',
  'hcl',
  'hemihydrate',
  'dihydrate',
  'hydrate',
  'mesylate',
  'fumarate',
  'tartrate',
  'succinate',
  'phosphate',
  'acetate',
  'zinc',
]

function extractDrugAttributes(genericName) {
  if (!genericName) {
    return {
      primary_ingredient: null,
      is_combination: false,
      ingredient_count: null,
      salt_form: null,
    }
  }

  const raw = String(genericName).trim()

  const parts = raw
    .split(/,|\+|\/|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean)

  const firstPart = parts[0] || raw
  const words = firstPart.split(/\s+/).filter(Boolean)

  const primaryIngredient = words[0] || firstPart

  const saltForm =
    words
      .slice(1)
      .find((word) =>
        saltWords.includes(
          word.toLowerCase().replace(/[^a-z]/g, '')
        )
      ) || null

  return {
    primary_ingredient: primaryIngredient,
    is_combination: parts.length > 1,
    ingredient_count: parts.length,
    salt_form: saltForm,
  }
}

const normalizedRows = jsonData.map((row) => {
  const n = {}

  for (const key in row) {
    const normalizedKey = normalizeColumnName(key)
    let value = row[key]

    if (normalizedKey.includes('date') && typeof value === 'number') {
      value = excelDateToJSDate(value)
    }

    n[normalizedKey] = value
  }

  const attrs = extractDrugAttributes(n.generic_name)

  return {
    drug_code: n.drug_code || null,
    doh_code: n.drug_code || null,

    generic_name: n.generic_name || null,
    brand_name: n.package_name || null,
    package_name: n.package_name || null,

    primary_ingredient: attrs.primary_ingredient,
    is_combination: attrs.is_combination,
    ingredient_count: attrs.ingredient_count,
    salt_form: attrs.salt_form,

    strength: n.strength || null,
    dosage_form: n.dosage_form || null,
    package_size: n.package_size || null,

    manufacturer: n.manufacturer_name || null,
    agent: n.agent_name || null,

    dispense_mode: n.dispense_mode || null,

    price_to_public: n.package_price_to_public || null,
    price_to_pharmacy: n.package_price_to_pharmacy || null,

    unit_price_to_public: n.unit_price_to_public || null,
    unit_price_to_pharmacy: n.unit_price_to_pharmacy || null,

    unit_markup: n.unit_markup || null,
    package_markup: n.package_markup || null,

    upp_scope: n.upp_scope || null,

    insurance_plan: n.insurance_plan || null,

    insurance_basic:
      n.included_in_basic_drug_formulary === 'Yes',

    insurance_thiqa:
      n.included_in_thiqa_abm_other_than_1_7_drug_formulary === 'Yes',

    status: n.status || null,
    last_change_date: n.last_change_date || null,

    raw_source: 'DOH',
    is_active: n.status === 'Active',
  }
})

console.log('TOTAL ROWS:')
console.log(normalizedRows.length)

console.log('FIRST NORMALIZED ROW:')
console.log(normalizedRows[0])

const BATCH_SIZE = 500

async function importData() {
  const { error: truncateError } = await supabase
    .from('drug_master_reference')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (truncateError) {
    console.error('CLEAR ERROR:')
    console.error(truncateError)
    return
  }

  for (let i = 0; i < normalizedRows.length; i += BATCH_SIZE) {
    const batch = normalizedRows.slice(i, i + BATCH_SIZE)

    console.log(`IMPORTING BATCH ${i} -> ${i + batch.length}`)

    const { error } = await supabase
      .from('drug_master_reference')
      .insert(batch)

    if (error) {
      console.error('IMPORT ERROR:')
      console.error(error)
      return
    }

    console.log('BATCH IMPORTED SUCCESSFULLY')
  }

  console.log('ALL DATA IMPORTED SUCCESSFULLY')
}

importData()