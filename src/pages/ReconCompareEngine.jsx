import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'

const KNOWN_KEY_COLS     = ['drug_code','item_code','barcode','sku','code','id']
const KNOWN_QTY_COLS     = ['quantity','qty','quantity_on_hand','system_qty','physical_qty','count','stock','units']
const KNOWN_COST_COLS    = ['unit_cost','cost','price','unit_price','cost_price']
const KNOWN_NAME_COLS    = ['drug_name','item_name','name','description','generic_name','brand_name','product_name']

const DIR_META = {
  MATCHED:          { label: 'Matched',           color: 'var(--color-success)',     bg: 'rgba(29,158,117,0.12)', border: 'rgba(29,158,117,0.30)'  },
  SHORTAGE:         { label: 'Shortage',           color: 'var(--color-danger-mid)',  bg: 'rgba(163,45,45,0.12)',  border: 'rgba(163,45,45,0.30)'   },
  EXCESS:           { label: 'Excess',             color: 'var(--color-warning-mid)', bg: 'rgba(186,117,23,0.12)', border: 'rgba(186,117,23,0.30)'  },
  MISSING_PHYSICAL: { label: 'Missing in physical',color: 'var(--color-danger-mid)',  bg: 'rgba(163,45,45,0.12)',  border: 'rgba(163,45,45,0.30)'   },
  EXTRA_PHYSICAL:   { label: 'Extra in physical',  color: 'var(--color-text-accent)', bg: 'rgba(24,95,165,0.12)',  border: 'rgba(24,95,165,0.30)'   },
}

function detectCol(headers, candidates) {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const c of candidates) {
    const idx = lower.findIndex(h => h === c || h.replace(/[\s-]/g,'_') === c)
    if (idx !== -1) return headers[idx]
  }
  return ''
}

function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const headers = rows.length > 0 ? Object.keys(rows[0]) : []
        resolve({ rows, headers, sheetName: wb.SheetNames[0] })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function runComparison({ systemRows, physicalRows, sysMap, physMap }) {
  const sysIndex  = new Map()
  const physIndex = new Map()

  for (const row of systemRows) {
    const key = String(row[sysMap.key] ?? '').trim()
    if (!key) continue
    sysIndex.set(key, row)
  }

  for (const row of physicalRows) {
    const key = String(row[physMap.key] ?? '').trim()
    if (!key) continue
    physIndex.set(key, row)
  }

  const results = []
  const allKeys = new Set([...sysIndex.keys(), ...physIndex.keys()])

  for (const key of allKeys) {
    const sysRow  = sysIndex.get(key)
    const physRow = physIndex.get(key)

    const sysQty  = sysRow  ? Number(sysRow[sysMap.qty]   ?? 0) : null
    const physQty = physRow ? Number(physRow[physMap.qty]  ?? 0) : null

    const unitCost = sysRow && sysMap.cost
      ? Number(sysRow[sysMap.cost] ?? 0)
      : physRow && physMap.cost
      ? Number(physRow[physMap.cost] ?? 0)
      : null

    const itemName = sysRow && sysMap.name
      ? String(sysRow[sysMap.name] ?? '')
      : physRow && physMap.name
      ? String(physRow[physMap.name] ?? '')
      : ''

    let direction
    if (sysRow && !physRow)       direction = 'MISSING_PHYSICAL'
    else if (!sysRow && physRow)  direction = 'EXTRA_PHYSICAL'
    else if (sysQty === physQty)  direction = 'MATCHED'
    else if (physQty < sysQty)    direction = 'SHORTAGE'
    else                          direction = 'EXCESS'

    const varianceQty   = direction === 'MISSING_PHYSICAL' ? null
                        : direction === 'EXTRA_PHYSICAL'   ? physQty
                        : physQty - sysQty

    const varianceValue = varianceQty !== null && unitCost ? varianceQty * unitCost : null

    results.push({
      key, itemName, sysQty, physQty,
      varianceQty, varianceValue, unitCost, direction,
    })
  }

  results.sort((a, b) => {
    const order = { MISSING_PHYSICAL:0, SHORTAGE:1, EXTRA_PHYSICAL:2, EXCESS:3, MATCHED:4 }
    return (order[a.direction] ?? 5) - (order[b.direction] ?? 5)
  })

  return results
}

function buildKpis(results) {
  const total            = results.length
  const matched          = results.filter(r => r.direction === 'MATCHED').length
  const shortage         = results.filter(r => r.direction === 'SHORTAGE').length
  const excess           = results.filter(r => r.direction === 'EXCESS').length
  const missingPhysical  = results.filter(r => r.direction === 'MISSING_PHYSICAL').length
  const extraPhysical    = results.filter(r => r.direction === 'EXTRA_PHYSICAL').length
  const totalVarianceVal = results.reduce((s,r) => s + Math.abs(r.varianceValue ?? 0), 0)
  return { total, matched, shortage, excess, missingPhysical, extraPhysical, totalVarianceVal }
}

export default function ReconCompareEngine() {
  const sysRef  = useRef()
  const physRef = useRef()

  const [sysFile,  setSysFile]  = useState(null)
  const [physFile, setPhysFile] = useState(null)
  const [sysData,  setSysData]  = useState(null)
  const [physData, setPhysData] = useState(null)
  const [sysMap,   setSysMap]   = useState({ key:'', qty:'', cost:'', name:'' })
  const [physMap,  setPhysMap]  = useState({ key:'', qty:'', cost:'', name:'' })
  const [results,  setResults]  = useState(null)
  const [kpis,     setKpis]     = useState(null)
  const [dirFilter,setDirFilter]= useState('ALL')
  const [search,   setSearch]   = useState('')
  const [error,    setError]    = useState('')
  const [parsing,  setParsing]  = useState('')

  async function handleFile(file, side) {
    if (!file) return
    setParsing(side)
    setError('')
    setResults(null)
    setKpis(null)
    try {
      const parsed = await parseFile(file)
      const auto = {
        key:  detectCol(parsed.headers, KNOWN_KEY_COLS),
        qty:  detectCol(parsed.headers, KNOWN_QTY_COLS),
        cost: detectCol(parsed.headers, KNOWN_COST_COLS),
        name: detectCol(parsed.headers, KNOWN_NAME_COLS),
      }
      if (side === 'sys') {
        setSysFile(file)
        setSysData(parsed)
        setSysMap(auto)
      } else {
        setPhysFile(file)
        setPhysData(parsed)
        setPhysMap(auto)
      }
    } catch (e) {
      setError(`Failed to parse ${side === 'sys' ? 'System Count' : 'Physical Count'} file: ${e.message}`)
    }
    setParsing('')
  }

  function compare() {
    setError('')
    if (!sysData || !physData) { setError('Please upload both files before comparing.'); return }
    if (!sysMap.key)           { setError('Please map the Key column for the System Count file.');  return }
    if (!physMap.key)          { setError('Please map the Key column for the Physical Count file.'); return }
    if (!sysMap.qty)           { setError('Please map the Quantity column for the System Count file.'); return }
    if (!physMap.qty)          { setError('Please map the Quantity column for the Physical Count file.'); return }

    const res  = runComparison({ systemRows: sysData.rows, physicalRows: physData.rows, sysMap, physMap })
    const kpis = buildKpis(res)
    setResults(res)
    setKpis(kpis)
    setDirFilter('ALL')
    setSearch('')
  }

  function reset() {
    setSysFile(null); setPhysFile(null)
    setSysData(null); setPhysData(null)
    setSysMap({ key:'', qty:'', cost:'', name:'' })
    setPhysMap({ key:'', qty:'', cost:'', name:'' })
    setResults(null); setKpis(null)
    setDirFilter('ALL'); setSearch('')
    setError('')
  }

  function exportCSV() {
    if (!results) return
    const rows = filteredResults.map(r => ({
      key:            r.key,
      item_name:      r.itemName,
      system_qty:     r.sysQty  ?? 'N/A',
      physical_qty:   r.physQty ?? 'N/A',
      variance_qty:   r.varianceQty  ?? 'N/A',
      unit_cost:      r.unitCost     ?? 'N/A',
      variance_value: r.varianceValue != null ? r.varianceValue.toFixed(2) : 'N/A',
      direction:      r.direction,
      status:         DIR_META[r.direction]?.label ?? r.direction,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Recon Variance')
    XLSX.writeFile(wb, `falconmed_recon_compare_${new Date().toISOString().slice(0,10)}.csv`)
  }

  const filteredResults = results ? results.filter(r => {
    const matchDir    = dirFilter === 'ALL' || r.direction === dirFilter
    const matchSearch = !search.trim() || r.key.toLowerCase().includes(search.toLowerCase()) || r.itemName.toLowerCase().includes(search.toLowerCase())
    return matchDir && matchSearch
  }) : []

  const hasCost = results && results.some(r => r.varianceValue !== null)

  return (
    <div>
      <div className="fm-page-header">
        <div className="fm-page-header-top">
          <div>
            <div className="fm-page-header-meta">Governance</div>
            <h1 className="fm-page-header-title">Recon file compare</h1>
            <p className="fm-page-header-desc">
              Upload a system count file and a physical count file to generate a
              variance analysis. Client-side only — no data is written to the database.
            </p>
          </div>
          {results && (
            <div className="fm-page-header-actions">
              <button className="fm-btn" onClick={exportCSV}>Export CSV</button>
              <button className="fm-btn" onClick={reset}>Reset</button>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-accent)',
          background: 'rgba(24,95,165,0.10)',
          border: '1px solid rgba(24,95,165,0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '5px 12px',
          marginBottom: '20px',
        }}
      >
        <span style={{ fontWeight: 'var(--font-medium)' }}>Educational tool</span>
        · Simulation-safe · No Supabase writes · No inventory changes
      </div>

      {error && (
        <div style={{
          background: 'rgba(163,45,45,0.12)',
          border: '1px solid rgba(163,45,45,0.30)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-danger-mid)',
          marginBottom: '16px',
        }}>
          ✕ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '16px', marginBottom: '20px' }}>
        <FileUploadCard
          label="System count file"
          subtitle="Your ERP / pharmacy system export"
          file={sysFile}
          data={sysData}
          mapping={sysMap}
          parsing={parsing === 'sys'}
          inputRef={sysRef}
          onFile={f => handleFile(f, 'sys')}
          onMap={(field, val) => setSysMap(prev => ({ ...prev, [field]: val }))}
        />
        <FileUploadCard
          label="Physical count file"
          subtitle="Manual or scanner count results"
          file={physFile}
          data={physData}
          mapping={physMap}
          parsing={parsing === 'phys'}
          inputRef={physRef}
          onFile={f => handleFile(f, 'phys')}
          onMap={(field, val) => setPhysMap(prev => ({ ...prev, [field]: val }))}
        />
      </div>

      {sysData && physData && !results && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <button
            className="fm-btn fm-btn-primary"
            onClick={compare}
            style={{ padding: '10px 32px', fontSize: 'var(--text-md)' }}
          >
            Run comparison
          </button>
        </div>
      )}

      {kpis && (
        <>
          <div className="fm-grid-kpi" style={{ marginBottom: '20px' }}>
            <ReconKpi label="Total items"         value={kpis.total}           color="var(--color-text-accent)"  bar="var(--color-primary)"     />
            <ReconKpi label="Matched"             value={kpis.matched}         color="var(--color-success)"      bar="var(--color-success)"      />
            <ReconKpi label="Shortage"            value={kpis.shortage}        color="var(--color-danger-mid)"   bar="var(--color-danger-mid)"   />
            <ReconKpi label="Excess"              value={kpis.excess}          color="var(--color-warning-mid)"  bar="var(--color-warning-mid)"  />
            <ReconKpi label="Missing in physical" value={kpis.missingPhysical} color="var(--color-danger-mid)"   bar="var(--color-danger-mid)"   />
            <ReconKpi label="Extra in physical"   value={kpis.extraPhysical}   color="var(--color-text-accent)"  bar="var(--color-primary)"      />
            {hasCost && (
              <ReconKpi
                label="Total variance value"
                value={`AED ${kpis.totalVarianceVal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`}
                color="var(--color-warning-mid)"
                bar="var(--color-warning-mid)"
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
            {['ALL', 'MATCHED', 'SHORTAGE', 'EXCESS', 'MISSING_PHYSICAL', 'EXTRA_PHYSICAL'].map(d => (
              <button
                key={d}
                onClick={() => setDirFilter(d)}
                className="fm-filter-pill"
                style={{
                  background:   dirFilter === d ? 'rgba(24,95,165,0.15)' : 'transparent',
                  borderColor:  dirFilter === d ? 'var(--color-primary)' : undefined,
                  color:        dirFilter === d ? 'var(--color-text-accent)' : undefined,
                }}
              >
                {d === 'ALL' ? 'All' : DIR_META[d]?.label ?? d}
                {d !== 'ALL' && (
                  <span style={{
                    marginLeft: '5px',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-tertiary)',
                  }}>
                    {results.filter(r => r.direction === d).length}
                  </span>
                )}
              </button>
            ))}

            <input
              type="text"
              placeholder="Search by code or name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                marginLeft: 'auto',
                padding: '5px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-sans)',
                minWidth: '200px',
              }}
            />

            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
              {filteredResults.length.toLocaleString()} of {results.length.toLocaleString()} items
            </span>
          </div>

          <div className="fm-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="fm-table-wrap">
              <table className="fm-table">
                <thead>
                  <tr>
                    <th>Code / key</th>
                    <th>Item name</th>
                    <th>System qty</th>
                    <th>Physical qty</th>
                    <th>Variance qty</th>
                    {hasCost && <th>Unit cost</th>}
                    {hasCost && <th>Variance value</th>}
                    <th>Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.length === 0 && (
                    <tr>
                      <td colSpan={hasCost ? 8 : 6} style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '24px' }}>
                        No results match the current filter.
                      </td>
                    </tr>
                  )}
                  {filteredResults.map((r, i) => (
                    <tr key={`${r.key}-${i}`}>
                      <td>
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-accent)',
                        }}>
                          {r.key}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'normal', maxWidth: '220px' }}>
                        {r.itemName || <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>}
                      </td>
                      <td style={{ fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
                        {r.sysQty  ?? <span style={{ color: 'var(--color-text-tertiary)' }}>N/A</span>}
                      </td>
                      <td style={{ fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
                        {r.physQty ?? <span style={{ color: 'var(--color-text-tertiary)' }}>N/A</span>}
                      </td>
                      <td>
                        <VarianceQty value={r.varianceQty} direction={r.direction} />
                      </td>
                      {hasCost && (
                        <td className="fm-table-muted">
                          {r.unitCost != null ? `AED ${r.unitCost.toFixed(2)}` : '—'}
                        </td>
                      )}
                      {hasCost && (
                        <td style={{
                          fontWeight: 'var(--font-medium)',
                          color: Math.abs(r.varianceValue ?? 0) > 0
                            ? 'var(--color-warning-mid)'
                            : 'var(--color-text-secondary)',
                        }}>
                          {r.varianceValue != null
                            ? `AED ${Math.abs(r.varianceValue).toFixed(2)}`
                            : '—'}
                        </td>
                      )}
                      <td>
                        <DirectionBadge direction={r.direction} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function FileUploadCard({ label, subtitle, file, data, mapping, parsing, inputRef, onFile, onMap }) {
  return (
    <div className="fm-card">
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)', marginBottom: '2px' }}>
          {label}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{subtitle}</div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]) }}
      />

      {!file ? (
        <button
          className="fm-btn"
          onClick={() => inputRef.current?.click()}
          style={{ width: '100%', justifyContent: 'center', padding: '20px', borderStyle: 'dashed' }}
        >
          {parsing ? 'Parsing...' : '+ Upload CSV or Excel'}
        </button>
      ) : (
        <div style={{
          background: 'var(--color-bg-content)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 12px',
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-primary)' }}>
              {file.name}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: '2px' }}>
              {data?.rows?.length?.toLocaleString() ?? 0} rows · Sheet: {data?.sheetName ?? '—'}
            </div>
          </div>
          <button
            className="fm-btn"
            style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </button>
        </div>
      )}

      {data && (
        <div style={{ display: 'grid', gap: '8px', marginTop: '4px' }}>
          <ColMapRow label="Key column *"      field="key"  headers={data.headers} value={mapping.key}  onChange={v => onMap('key',  v)} required />
          <ColMapRow label="Quantity column *"  field="qty"  headers={data.headers} value={mapping.qty}  onChange={v => onMap('qty',  v)} required />
          <ColMapRow label="Unit cost (optional)" field="cost" headers={data.headers} value={mapping.cost} onChange={v => onMap('cost', v)} />
          <ColMapRow label="Item name (optional)" field="name" headers={data.headers} value={mapping.name} onChange={v => onMap('name', v)} />
        </div>
      )}
    </div>
  )
}

function ColMapRow({ label, headers, value, onChange, required }) {
  const isDetected = value !== ''
  return (
    <div style={{ display: 'grid', gap: '3px' }}>
      <label style={{
        fontSize: 'var(--text-xs)',
        color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        {label}
        {isDetected && (
          <span style={{
            fontSize: '9px',
            padding: '1px 6px',
            borderRadius: 'var(--radius-pill)',
            background: 'rgba(29,158,117,0.12)',
            color: 'var(--color-success)',
            border: '1px solid rgba(29,158,117,0.25)',
            fontWeight: 'var(--font-medium)',
            textTransform: 'none',
            letterSpacing: 0,
          }}>
            Auto-detected
          </span>
        )}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '6px 10px',
          borderRadius: 'var(--radius-md)',
          border: `1px solid ${required && !value ? 'var(--color-danger-mid)' : 'var(--color-border-default)'}`,
          background: 'var(--color-bg-input)',
          color: value ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <option value="">— not mapped —</option>
        {headers.map(h => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    </div>
  )
}

function ReconKpi({ label, value, color, bar }) {
  return (
    <div className="fm-kpi-card">
      <div className="fm-kpi-label">{label}</div>
      <div className="fm-kpi-value" style={{ color, fontSize: typeof value === 'string' && value.length > 10 ? 'var(--text-base)' : undefined }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="fm-kpi-bar">
        <div className="fm-kpi-bar-fill" style={{ width: '60%', background: bar }} />
      </div>
    </div>
  )
}

function DirectionBadge({ direction }) {
  const meta = DIR_META[direction] ?? { label: direction, color: 'var(--color-text-secondary)', bg: 'transparent', border: 'var(--color-border-default)' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 'var(--radius-pill)',
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--font-medium)',
      whiteSpace: 'nowrap',
      color: meta.color,
      background: meta.bg,
      border: `1px solid ${meta.border}`,
    }}>
      {meta.label}
    </span>
  )
}

function VarianceQty({ value, direction }) {
  if (value === null || value === undefined) {
    return <span style={{ color: 'var(--color-text-tertiary)' }}>N/A</span>
  }
  const color = direction === 'MATCHED'
    ? 'var(--color-success)'
    : direction === 'SHORTAGE' || direction === 'MISSING_PHYSICAL'
    ? 'var(--color-danger-mid)'
    : 'var(--color-warning-mid)'

  const prefix = value > 0 ? '+' : ''
  return (
    <span style={{ fontWeight: 'var(--font-medium)', color, fontVariantNumeric: 'tabular-nums' }}>
      {prefix}{value.toLocaleString()}
    </span>
  )
}
