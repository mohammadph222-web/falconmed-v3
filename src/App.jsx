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
import InventoryIntelligencePage from './pages/InventoryIntelligencePage'
import SupplyChainPage from './pages/SupplyChainPage'

import './styles/tokens.css'
import './styles/layout.css'
import './styles/components.css'

const NAV_ZONES = [
  {
    label: 'Command',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    ],
  },
  {
    label: 'Formulary & Inventory',
    items: [
      { key: 'drug-search',            label: 'Drug Search',            icon: 'search'     },
      { key: 'inventory',              label: 'Inventory Explorer',     icon: 'package'    },
      { key: 'inventory-intelligence', label: 'Inventory Intelligence', icon: 'chart'      },
      { key: 'supply-chain',           label: 'Supply Chain',           icon: 'truck'      },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'transactions', label: 'Transactions', icon: 'arrows'   },
      { key: 'operations',   label: 'Operations',   icon: 'pill'     },
      { key: 'patients',     label: 'Patients',     icon: 'users'    },
      { key: 'stockcount',   label: 'Stock Count',  icon: 'clipboard'},
    ],
  },
  {
    label: 'Governance',
    items: [
      { key: 'reconciliation',       label: 'Reconciliation',       icon: 'scale' },
      { key: 'reconciliation-audit', label: 'Reconciliation Audit', icon: 'eye'   },
    ],
  },
]

function NavIcon({ name }) {
  const icons = {
    dashboard: (
      <svg viewBox="0 0 16 16" className="fm-nav-icon" aria-hidden="true">
        <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    ),
    search: (
      <svg viewBox="0 0 16 16" className="fm-nav-icon" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    package: (
      <svg viewBox="0 0 16 16" className="fm-nav-icon" aria-hidden="true">
        <path d="M13 5L8 2L3 5V11L8 14L13 11V5Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
        <path d="M8 2V14" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M3 5L13 5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M5.5 3.5L8 5L10.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    chart: (
      <svg viewBox="0 0 16 16" className="fm-nav-icon" aria-hidden="true">
        <path d="M2 12L5.5 8L8.5 10L12 5L14 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M2 14H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    truck: (
      <svg viewBox="0 0 16 16" className="fm-nav-icon" aria-hidden="true">
        <rect x="1" y="4" width="9" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M10 6H13L15 9V11H10V6Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
        <circle cx="4" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <circle cx="12" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    ),
    arrows: (
      <svg viewBox="0 0 16 16" className="fm-nav-icon" aria-hidden="true">
        <path d="M2 5H11M11 5L8 2M11 5L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M14 11H5M5 11L8 8M5 11L8 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    ),
    pill: (
      <svg viewBox="0 0 16 16" className="fm-nav-icon" aria-hidden="true">
        <rect x="2" y="6" width="12" height="4" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <line x1="8" y1="6" x2="8" y2="10" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
    users: (
      <svg viewBox="0 0 16 16" className="fm-nav-icon" aria-hidden="true">
        <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M1 13C1 10.8 3.2 9 6 9C8.8 9 11 10.8 11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <path d="M12 7C13.1 7 14 7.9 14 9C14 10.1 13.1 11 12 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <path d="M14 13C14 11.5 13.2 10.2 12 9.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </svg>
    ),
    clipboard: (
      <svg viewBox="0 0 16 16" className="fm-nav-icon" aria-hidden="true">
        <rect x="3" y="2" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M6 2V4H10V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M5 8H11M5 11H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
    scale: (
      <svg viewBox="0 0 16 16" className="fm-nav-icon" aria-hidden="true">
        <path d="M8 2V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M4 14H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M3 2H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M3 2L1 6C1 7.1 1.9 8 3 8C4.1 8 5 7.1 5 6L3 2Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
        <path d="M13 2L11 6C11 7.1 11.9 8 13 8C14.1 8 15 7.1 15 6L13 2Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
      </svg>
    ),
    eye: (
      <svg viewBox="0 0 16 16" className="fm-nav-icon" aria-hidden="true">
        <path d="M1 8C1 8 3.5 3 8 3C12.5 3 15 8 15 8C15 8 12.5 13 8 13C3.5 13 1 8 1 8Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </svg>
    ),
  }
  return icons[name] || null
}

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
    <div className="fm-app-shell">

      <aside className="fm-sidebar" role="navigation" aria-label="FalconMed navigation">

        <div className="fm-brand">
          <div className="fm-brand-mark">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="2" y="7" width="12" height="2" rx="1" stroke="white" strokeWidth="1.5" fill="none"/>
              <rect x="7" y="2" width="2" height="12" rx="1" stroke="white" strokeWidth="1.5" fill="none"/>
              <circle cx="8" cy="8" r="6.5" stroke="white" strokeWidth="1.5" fill="none"/>
            </svg>
          </div>
          <div className="fm-brand-text">
            <span className="fm-brand-name">FalconMed</span>
            <span className="fm-brand-version">v3 · Pharmacy Analytics</span>
          </div>
        </div>

        <nav className="fm-nav">
          {NAV_ZONES.map((zone) => (
            <div key={zone.label} className="fm-nav-zone">
              <span className="fm-nav-zone-label">{zone.label}</span>
              {zone.items.map((item) => (
                <button
                  key={item.key}
                  className={`fm-nav-item${currentPage === item.key ? ' active' : ''}`}
                  onClick={() => setCurrentPage(item.key)}
                  type="button"
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="fm-sidebar-footer">
          <span className="fm-sidebar-footer-label">
            <span className="fm-sim-dot" aria-hidden="true" />
            Simulated data · June 2026
          </span>
        </div>

      </aside>

      <main className="fm-content">
        <div className="fm-page">

          {currentPage === 'dashboard' && <DashboardPage />}
          {currentPage === 'inventory' && <InventoryExplorerPage />}
          {currentPage === 'inventory-intelligence' && <InventoryIntelligencePage />}
          {currentPage === 'supply-chain' && <SupplyChainPage />}
          {currentPage === 'transactions' && <InventoryTransactionsPage />}
          {currentPage === 'operations' && <InventoryOperationsPage />}
          {currentPage === 'patients' && <PatientRegistryPage />}
          {currentPage === 'stockcount' && <StockCountPage />}
          {currentPage === 'reconciliation' && <ReconciliationCasesPage />}
          {currentPage === 'reconciliation-audit' && <ReconciliationAuditPage />}

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
      </main>

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