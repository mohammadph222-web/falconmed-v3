console.log('IMPORT SCRIPT VERSION: NORMALIZED_ROWS_V1')
import XLSX from 'xlsx'

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

const normalizedRows = jsonData.map((row) => {
  const normalizedRow = {}

  for (const key in row) {
    const normalizedKey = normalizeColumnName(key)

    let value = row[key]

    if (normalizedKey.includes('date') && typeof value === 'number') {
      value = excelDateToJSDate(value)
    }

    normalizedRow[normalizedKey] = value
  }

  return normalizedRow
})

console.log('TOTAL RAW ROWS:')
console.log(jsonData.length)

console.log('TOTAL NORMALIZED ROWS:')
console.log(normalizedRows.length)

console.log('FIRST NORMALIZED ROW:')
console.log(normalizedRows[0])