import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

export default function ImportCenterPanel() {
  const [fileInputKey, setFileInputKey] = useState(0)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [validRows, setValidRows] = useState([])
  const [invalidRows, setInvalidRows] = useState([])
  const [importedRows, setImportedRows] = useState(0)
  const [importJobStatus, setImportJobStatus] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const [importing, setImporting] = useState(false)

  function handleFileUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setRows([])
    setValidRows([])
    setInvalidRows([])
    setImportedRows(0)
    setImportJobStatus('')
    setImportStatus('')

    const reader = new FileReader()

    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' })

      setRows(jsonRows)

      const result = validateRows(jsonRows)

      await createImportJob({
        importType: 'inventory',
        fileName: file.name,
        totalRows: jsonRows.length,
        validRows: result.valid.length,
        invalidRows: result.invalid.length,
        status: 'VALIDATED',
        notes: 'File uploaded and validated in FalconMed Import Center',
      })
    }

    reader.readAsArrayBuffer(file)
  }

  function validateRows(importRows) {
    const valid = []
    const invalid = []

    importRows.forEach((row, index) => {
      const errors = []

      if (!row.pharmacy_code) errors.push('Missing pharmacy_code')
      if (!row.drug_code) errors.push('Missing drug_code')
      if (!row.batch_number) errors.push('Missing batch_number')
      if (!row.expiry_date) errors.push('Missing expiry_date')

      if (row.quantity_on_hand === '') errors.push('Missing quantity_on_hand')
      if (row.minimum_stock === '') errors.push('Missing minimum_stock')
      if (row.maximum_stock === '') errors.push('Missing maximum_stock')
      if (row.unit_cost === '') errors.push('Missing unit_cost')

      if (isNaN(Number(row.quantity_on_hand))) errors.push('Invalid quantity_on_hand')
      if (isNaN(Number(row.minimum_stock))) errors.push('Invalid minimum_stock')
      if (isNaN(Number(row.maximum_stock))) errors.push('Invalid maximum_stock')
      if (isNaN(Number(row.unit_cost))) errors.push('Invalid unit_cost')

      const checkedRow = {
        row_number: index + 2,
        ...row,
        validation_errors: errors.join('; '),
      }

      if (errors.length > 0) {
        invalid.push(checkedRow)
      } else {
        valid.push(checkedRow)
      }
    })

    setValidRows(valid)
    setInvalidRows(invalid)

    return { valid, invalid }
  }

  async function createImportJob({
    importType,
    fileName,
    totalRows,
    validRows,
    invalidRows,
    status,
    notes,
  }) {
    setImportJobStatus('Saving import job...')

    const { error } = await supabase.from('import_jobs').insert([
      {
        import_type: importType,
        file_name: fileName,
        total_rows: totalRows,
        valid_rows: validRows,
        invalid_rows: invalidRows,
        status,
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        notes,
      },
    ])

    if (error) {
      console.error('Import job error:', error)
      setImportJobStatus(`Failed to save import job: ${error.message}`)
      return false
    }

    setImportJobStatus('Import job saved successfully.')
    return true
  }

  function clearFile() {
    setFileInputKey((prev) => prev + 1)
    setFileName('')
    setRows([])
    setValidRows([])
    setInvalidRows([])
    setImportedRows(0)
    setImportJobStatus('')
    setImportStatus('')
    setImporting(false)
  }

  async function confirmImportAllValidRows() {
    if (!validRows.length) {
      alert('No valid rows available for import.')
      return
    }

    const confirmed = window.confirm(
      `This will import/update all ${validRows.length} valid rows into Supabase inventory. Continue?`
    )

    if (!confirmed) return

    setImporting(true)
    setImportedRows(0)
    setImportStatus(`Importing ${validRows.length} valid rows...`)

    const rowsToImport = validRows

    const pharmacyCodes = [
      ...new Set(rowsToImport.map((row) => row.pharmacy_code)),
    ]

    const drugCodes = [
      ...new Set(rowsToImport.map((row) => row.drug_code)),
    ]

    const { data: pharmacies, error: pharmacyError } = await supabase
      .from('pharmacies')
      .select('id, organization_id, code')
      .in('code', pharmacyCodes)

    if (pharmacyError) {
      console.error(pharmacyError)
      setImportStatus(`Pharmacy lookup failed: ${pharmacyError.message}`)
      setImporting(false)
      return
    }

    const { data: drugs, error: drugError } = await supabase
      .from('drug_master_reference')
      .select('drug_code')
      .in('drug_code', drugCodes)

    if (drugError) {
      console.error(drugError)
      setImportStatus(`Drug lookup failed: ${drugError.message}`)
      setImporting(false)
      return
    }

    const pharmacyMap = new Map((pharmacies || []).map((p) => [p.code, p]))
    const drugSet = new Set((drugs || []).map((d) => d.drug_code))

    const importRows = []

    for (const row of rowsToImport) {
      const pharmacy = pharmacyMap.get(row.pharmacy_code)

      if (!pharmacy) {
        setImportStatus(`Import stopped: pharmacy_code not found: ${row.pharmacy_code}`)
        setImporting(false)
        return
      }

      if (!drugSet.has(row.drug_code)) {
        setImportStatus(`Import stopped: drug_code not found: ${row.drug_code}`)
        setImporting(false)
        return
      }

      importRows.push({
        organization_id: pharmacy.organization_id,
        pharmacy_id: pharmacy.id,
        drug_code: row.drug_code,
        quantity_on_hand: Number(row.quantity_on_hand || 0),
        minimum_stock: Number(row.minimum_stock || 0),
        maximum_stock: Number(row.maximum_stock || 0),
        batch_number: row.batch_number,
        expiry_date: row.expiry_date,
        unit_cost: Number(row.unit_cost || 0),
        storage_location: row.storage_location || null,
        inventory_status: row.inventory_status || 'ACTIVE',
        purchase_price: Number(row.purchase_price || row.unit_cost || 0),
        received_date: row.received_date || null,
      })
    }

    const { error: upsertError } = await supabase
      .from('inventory')
      .upsert(importRows, {
        onConflict: 'pharmacy_id,drug_code,batch_number',
        ignoreDuplicates: false,
      })

    if (upsertError) {
      console.error(upsertError)
      setImportStatus(`Import failed: ${upsertError.message}`)
      setImporting(false)
      return
    }

    await createImportJob({
      importType: 'inventory_import',
      fileName,
      totalRows: rowsToImport.length,
      validRows: rowsToImport.length,
      invalidRows: 0,
      status: 'IMPORTED_ALL_VALID_ROWS',
      notes: 'Imported or updated all valid rows into inventory from Import Center',
    })

    setImportedRows(importRows.length)
    setImportStatus(`Successfully imported/updated ${importRows.length} valid rows.`)
    setImporting(false)
  }

  return (
    <div style={panelStyle}>
      <h2 style={{ marginTop: 0 }}>Phase 8.4 — Import Center</h2>

      <p style={{ color: '#94a3b8' }}>
        Upload inventory Excel files, validate rows, preview data, then import or update inventory safely.
      </p>

      <div style={uploadBoxStyle}>
        <input
          key={fileInputKey}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileUpload}
          style={inputStyle}
        />

        <div style={{ color: '#cbd5e1', marginTop: '12px' }}>
          Selected file: <strong>{fileName || 'No file selected'}</strong>
        </div>

        {importJobStatus && (
          <div style={{ color: '#34d399', marginTop: '8px' }}>
            {importJobStatus}
          </div>
        )}
      </div>

      <div style={statsGridStyle}>
        <ImportStat title="Total Rows" value={rows.length} tone="blue" />
        <ImportStat title="Valid Rows" value={validRows.length} tone="green" />
        <ImportStat title="Invalid Rows" value={invalidRows.length} tone="red" />
        <ImportStat title="Imported / Updated Rows" value={importedRows} tone="green" />
      </div>

      {rows.length > 0 && (
        <div style={actionBarStyle}>
          <button
            style={importButtonStyle}
            onClick={confirmImportAllValidRows}
            disabled={importing || !validRows.length}
          >
            {importing ? 'Importing...' : 'Confirm Import All Valid Rows'}
          </button>

          <button style={clearButtonStyle} onClick={clearFile}>
            Clear File
          </button>
        </div>
      )}

      {importStatus && (
        <div style={{ color: '#34d399', marginTop: '12px', fontWeight: 700 }}>
          {importStatus}
        </div>
      )}

      {rows.length > 0 && (
        <div style={previewPanelStyle}>
          <h3>Preview</h3>

          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Row</th>
                  <th style={thStyle}>Pharmacy Code</th>
                  <th style={thStyle}>Drug Code</th>
                  <th style={thStyle}>Batch</th>
                  <th style={thStyle}>Expiry</th>
                  <th style={thStyle}>Quantity</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Errors</th>
                </tr>
              </thead>

              <tbody>
                {[...validRows, ...invalidRows].slice(0, 50).map((row) => (
                  <tr key={row.row_number}>
                    <td style={tdStyle}>{row.row_number}</td>
                    <td style={tdStyle}>{row.pharmacy_code}</td>
                    <td style={tdStyle}>{row.drug_code}</td>
                    <td style={tdStyle}>{row.batch_number}</td>
                    <td style={tdStyle}>{String(row.expiry_date)}</td>
                    <td style={tdStyle}>{row.quantity_on_hand}</td>
                    <td style={tdStyle}>
                      {row.validation_errors ? 'Invalid' : 'Valid'}
                    </td>
                    <td style={tdStyle}>{row.validation_errors || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '10px' }}>
            Showing first 50 rows only.
          </div>
        </div>
      )}
    </div>
  )
}

function ImportStat({ title, value, tone }) {
  const color =
    tone === 'green' ? '#34d399' : tone === 'red' ? '#f87171' : '#60a5fa'

  return (
    <div style={statCardStyle}>
      <div style={{ color: '#94a3b8', fontSize: '14px' }}>{title}</div>
      <div style={{ color, fontSize: '32px', fontWeight: 900 }}>{value}</div>
    </div>
  )
}

const panelStyle = {
  background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
  border: '1px solid #334155',
  borderRadius: '18px',
  padding: '24px',
  marginTop: '24px',
  color: 'white',
}

const uploadBoxStyle = {
  border: '1px dashed #475569',
  borderRadius: '14px',
  padding: '20px',
  marginTop: '20px',
}

const inputStyle = {
  color: 'white',
}

const statsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '14px',
  marginTop: '18px',
}

const statCardStyle = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '14px',
  padding: '18px',
}

const actionBarStyle = {
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
  marginTop: '20px',
}

const importButtonStyle = {
  background: '#16a34a',
  color: 'white',
  border: 'none',
  borderRadius: '12px',
  padding: '14px 18px',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: '14px',
}

const clearButtonStyle = {
  background: '#dc2626',
  color: 'white',
  border: 'none',
  borderRadius: '12px',
  padding: '14px 18px',
  cursor: 'pointer',
  fontWeight: 800,
  fontSize: '14px',
}

const previewPanelStyle = {
  marginTop: '24px',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: '1000px',
}

const thStyle = {
  textAlign: 'left',
  padding: '12px',
  color: '#cbd5e1',
  borderBottom: '1px solid #334155',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '12px',
  borderBottom: '1px solid #1e293b',
  color: '#e5e7eb',
  whiteSpace: 'nowrap',
}