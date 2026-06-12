import PatientRegistryPage from './pages/PatientRegistryPage'
import StockCountPage from './pages/StockCountPage'
import ReconciliationCasesPage from './pages/ReconciliationCasesPage'
import ReconciliationAuditPage from './pages/ReconciliationAuditPage'
import { useState } from 'react'
import { searchDrugs } from './lib/drugMasterService'
import {
  parsePackageSize,
  calculateUnitPrice,
} from './lib/packagingEngine'
import DashboardPage from './pages/DashboardPage'
import InventoryExplorerPage from './pages/InventoryExplorerPage'
import InventoryTransactionsPage from './pages/InventoryTransactionsPage'

import InventoryOperationsPage from './pages/InventoryOperationsPage'
export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')

  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [selectedDrug, setSelectedDrug] = useState(null)
  const [loading, setLoading] = useState(false)

  const [thiqaOnly, setThiqaOnly] = useState(false)
  const [basicOnly, setBasicOnly] = useState(false)
  const [uppOnly, setUppOnly] = useState(false)
  const [activeOnly, setActiveOnly] = useState(true)
  const [singleIngredientOnly, setSingleIngredientOnly] = useState(false)
  const [combinationOnly, setCombinationOnly] = useState(false)
  const [searchMode, setSearchMode] = useState('all')

  function getFilters(overrides = {}) {
    return {
      thiqaOnly,
      basicOnly,
      uppOnly,
      activeOnly,
      singleIngredientOnly,
      combinationOnly,
      searchMode,
      ...overrides,
    }
  }

  async function runSearch(value = search, overrides = {}) {
    setSearch(value)
    setSelectedDrug(null)

    if (value.trim().length < 2) {
      setResults([])
      return
    }

    setLoading(true)

    const data = await searchDrugs(value, getFilters(overrides))

    setResults(data)
    setLoading(false)
  }

  function handleSelectDrug(drug) {
    setSelectedDrug(drug)
    setResults([])
    setSearch(drug.brand_name || drug.generic_name || '')
  }

  const visibleDrug = selectedDrug

  return (
    <div
      style={{
        background: '#020817',
        minHeight: '100vh',
        color: 'white',
        padding: '40px',
        fontFamily: 'Arial',
      }}
    >
      <h1 style={{ fontSize: '64px', marginBottom: '24px' }}>
        FalconMed v3
      </h1>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '30px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setCurrentPage('dashboard')}
          style={{
            padding: '12px 20px',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: currentPage === 'dashboard' ? 'bold' : 'normal',
          }}
        >
          Dashboard
        </button>

        <button
          onClick={() => setCurrentPage('drug-search')}
          style={{
            padding: '12px 20px',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: currentPage === 'drug-search' ? 'bold' : 'normal',
          }}
        >
          Drug Search
        </button>

        <button
          onClick={() => setCurrentPage('inventory')}
          style={{
            padding: '12px 20px',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: currentPage === 'inventory' ? 'bold' : 'normal',
          }}
        >
          Inventory Explorer
        </button>

        <button
  onClick={() => setCurrentPage('transactions')}
  style={{
    padding: '12px 20px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: currentPage === 'transactions' ? 'bold' : 'normal',
  }}
>
  Transactions
</button>

<button
  onClick={() => setCurrentPage('operations')}
  style={{
    padding: '12px 20px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: currentPage === 'operations' ? 'bold' : 'normal',
  }}
>
  Operations
</button>

<button
  onClick={() => setCurrentPage('patients')}
  style={{
    padding: '12px 20px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: currentPage === 'patients' ? 'bold' : 'normal',
  }}
>
  Patients
</button>
<button
  onClick={() => setCurrentPage('stockcount')}
  style={{
    padding: '12px 20px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: currentPage === 'stockcount' ? 'bold' : 'normal',
  }}
>
  Stock Count
</button>
<button
  onClick={() => setCurrentPage('reconciliation')}
  style={{
    padding: '12px 20px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: currentPage === 'reconciliation' ? 'bold' : 'normal',
  }}
>
  Reconciliation
</button>
<button
  onClick={() => setCurrentPage('reconciliation-audit')}
  style={{
    padding: '12px 20px',
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight:
      currentPage === 'reconciliation-audit'
        ? 'bold'
        : 'normal',
  }}
>
  Reconciliation Audit
</button>
      </div>

    {currentPage === 'dashboard' && <DashboardPage />}

{currentPage === 'inventory' && <InventoryExplorerPage />}

{currentPage === 'transactions' && <InventoryTransactionsPage />}

{currentPage === 'operations' && <InventoryOperationsPage />}
{currentPage === 'patients' && <PatientRegistryPage />}
{currentPage === 'stockcount' && <StockCountPage />}
{currentPage === 'reconciliation' && (
  <ReconciliationCasesPage />
)}
{currentPage === 'reconciliation-audit' && (
  <ReconciliationAuditPage />
)}

{currentPage === 'drug-search' && (
        <>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <label>
              <input
                type="checkbox"
                checked={thiqaOnly}
                onChange={(e) => {
                  const checked = e.target.checked
                  setThiqaOnly(checked)
                  runSearch(search, { thiqaOnly: checked })
                }}
              /> Thiqa
            </label>

            <label>
              <input
                type="checkbox"
                checked={basicOnly}
                onChange={(e) => {
                  const checked = e.target.checked
                  setBasicOnly(checked)
                  runSearch(search, { basicOnly: checked })
                }}
              /> Basic
            </label>

            <label>
              <input
                type="checkbox"
                checked={uppOnly}
                onChange={(e) => {
                  const checked = e.target.checked
                  setUppOnly(checked)
                  runSearch(search, { uppOnly: checked })
                }}
              /> UPP
            </label>

            <label>
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => {
                  const checked = e.target.checked
                  setActiveOnly(checked)
                  runSearch(search, { activeOnly: checked })
                }}
              /> Active Only
            </label>

            <label>
              <input
                type="checkbox"
                checked={singleIngredientOnly}
                onChange={(e) => {
                  const checked = e.target.checked
                  setSingleIngredientOnly(checked)
                  runSearch(search, { singleIngredientOnly: checked })
                }}
              /> Single Ingredient Only
            </label>

            <label>
              <input
                type="checkbox"
                checked={combinationOnly}
                onChange={(e) => {
                  const checked = e.target.checked
                  setCombinationOnly(checked)
                  runSearch(search, { combinationOnly: checked })
                }}
              /> Combination Only
            </label>

            <select
              value={searchMode}
              onChange={(e) => {
                const value = e.target.value
                setSearchMode(value)
                runSearch(search, { searchMode: value })
              }}
              style={{
                padding: '8px',
                borderRadius: '8px',
                fontSize: '16px',
              }}
            >
              <option value="all">All</option>
              <option value="generic">Generic Only</option>
              <option value="brand">Brand Only</option>
              <option value="code">Drug Code</option>
            </select>
          </div>

          <input
            value={search}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search drug..."
            style={{
              width: '100%',
              padding: '20px',
              borderRadius: '20px',
              border: 'none',
              fontSize: '24px',
              marginBottom: '16px',
            }}
          />

          {loading && <p>Searching...</p>}

          {results.length > 0 && !selectedDrug && (
            <div
              style={{
                background: '#0f172a',
                borderRadius: '18px',
                border: '1px solid #1e293b',
                marginBottom: '30px',
                overflow: 'hidden',
              }}
            >
              {results.map((drug) => (
                <button
                  key={drug.id}
                  onClick={() => handleSelectDrug(drug)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '18px 22px',
                    background: '#0f172a',
                    color: 'white',
                    border: 'none',
                    borderBottom: '1px solid #1e293b',
                    cursor: 'pointer',
                    fontSize: '18px',
                  }}
                >
                  <strong>{drug.generic_name}</strong>
                  <div style={{ color: '#38bdf8', marginTop: '6px' }}>
                    {drug.brand_name} — {drug.strength} — {drug.dosage_form}
                  </div>
                  <div style={{ color: '#94a3b8', marginTop: '4px' }}>
                    Package: {drug.package_size} | Public: AED {drug.price_to_public} | Thiqa: {drug.insurance_thiqa ? 'Yes' : 'No'} | Basic: {drug.insurance_basic ? 'Yes' : 'No'} | UPP: {drug.upp_scope || 'No'}
                  </div>
                </button>
              ))}
            </div>
          )}

          {visibleDrug && <DrugCard drug={visibleDrug} />}
        </>
      )}
    </div>
  )
}

function DrugCard({ drug }) {
  const parsed = parsePackageSize(drug.package_size)
  const calculatedUnitPrice = calculateUnitPrice(
    drug.price_to_public,
    drug.package_size
  )

  return (
    <div
      style={{
        background: '#0f172a',
        padding: '40px',
        borderRadius: '28px',
        border: '1px solid #1e293b',
      }}
    >
      <h2 style={{ fontSize: '54px', marginBottom: '18px' }}>
        {drug.generic_name}
      </h2>

      <div style={{ fontSize: '34px', color: '#38bdf8', marginBottom: '28px' }}>
        {drug.brand_name}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '20px',
          fontSize: '22px',
          lineHeight: 1.8,
          marginBottom: '30px',
        }}
      >
        <div><strong>Strength:</strong> {drug.strength}</div>
        <div><strong>Dosage Form:</strong> {drug.dosage_form}</div>
        <div><strong>Package:</strong> {drug.package_size}</div>
        <div><strong>Detected Units:</strong> {parsed.unitCount || '-'}</div>
        <div><strong>Parse Confidence:</strong> {parsed.confidence}</div>
        <div><strong>Status:</strong> {drug.is_active ? 'Active' : 'Inactive'}</div>
        <div><strong>Public Price:</strong> AED {drug.price_to_public}</div>
        <div><strong>Pharmacy Price:</strong> AED {drug.price_to_pharmacy}</div>
        <div><strong>Calculated Unit Price:</strong> AED {calculatedUnitPrice ? calculatedUnitPrice.toFixed(2) : '-'}</div>
        <div><strong>Unit Public Price:</strong> AED {drug.unit_price_to_public || '-'}</div>
        <div><strong>Unit Pharmacy Price:</strong> AED {drug.unit_price_to_pharmacy || '-'}</div>
        <div><strong>Basic Insurance:</strong> {drug.insurance_basic ? 'Yes' : 'No'}</div>
        <div><strong>Thiqa:</strong> {drug.insurance_thiqa ? 'Yes' : 'No'}</div>
        <div><strong>UPP:</strong> {drug.upp_scope || '-'}</div>
        <div><strong>Unit Markup:</strong> {drug.unit_markup || '-'}</div>
        <div><strong>Package Markup:</strong> {drug.package_markup || '-'}</div>
        <div><strong>Insurance Plan:</strong> {drug.insurance_plan || '-'}</div>
        <div><strong>Dispense Mode:</strong> {drug.dispense_mode || '-'}</div>
        <div><strong>Last Change:</strong> {drug.last_change_date || '-'}</div>
      </div>

      <div
        style={{
          padding: '20px',
          background: '#020617',
          borderRadius: '18px',
          fontSize: '18px',
          color: '#94a3b8',
        }}
      >
        <div><strong>Manufacturer:</strong> {drug.manufacturer || 'N/A'}</div>
        <div><strong>Agent:</strong> {drug.agent || 'N/A'}</div>
        <div><strong>Drug Code:</strong> {drug.drug_code}</div>
        <div><strong>Raw Source:</strong> {drug.raw_source}</div>
      </div>
    </div>
  )
}