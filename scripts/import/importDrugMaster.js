import XLSX from 'xlsx'

const workbook = XLSX.readFile('./data/raw/doh_drug_master_raw.xlsx')

const sheetName = 'Drugs'
const drugSheet = workbook.Sheets[sheetName]

if (!drugSheet) {
  throw new Error(`Sheet "${sheetName}" not found`)
}

const jsonData = XLSX.utils.sheet_to_json(drugSheet)

function normalizeColumnName(column) {
  return column
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '_')
}

const normalizedFirstRow = {}

for (const key of Object.keys(jsonData[0])) {
  normalizedFirstRow[normalizeColumnName(key)] = jsonData[0][key]
}

console.log('TOTAL ROWS:')
console.log(jsonData.length)

console.log('NORMALIZED FIRST ROW:')
console.log(normalizedFirstRow)