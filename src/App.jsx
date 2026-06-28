import PatientRegistryPage from './pages/PatientRegistryPage'
import StockCountPage from './pages/StockCountPage'
import ReconciliationCasesPage from './pages/ReconciliationCasesPage'
import ReconciliationAuditPage from './pages/ReconciliationAuditPage'
import ReconCompareEngine from './pages/ReconCompareEngine'
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
import NearExpiryAnalyticsPage from './pages/NearExpiryAnalyticsPage'
import FinancialAnalyticsPage    from './pages/FinancialAnalyticsPage'
import AvailabilityAnalyticsPage  from './pages/AvailabilityAnalyticsPage'
import SupplyChainAnalyticsPage   from './pages/SupplyChainAnalyticsPage'
import InventoryEfficiencyPage     from './pages/InventoryEfficiencyPage'
import SupplyChainPage from './pages/SupplyChainPage'
import falconLogo from './assets/falconmedlogo.png'

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
      { key: 'drug-search',            label: 'Drug Search',            icon: 'search'    },
      { key: 'inventory',              label: 'Inventory Explorer',     icon: 'package'   },
      { key: 'inventory-intelligence', label: 'Inventory Intelligence', icon: 'chart'     },
      { key: 'supply-chain',           label: 'Supply Chain',           icon: 'truck'     },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'transactions', label: 'Transactions', icon: 'arrows'    },
      { key: 'operations',   label: 'Operations',   icon: 'pill'      },
      { key: 'patients',     label: 'Patients',     icon: 'users'     },
      { key: 'stockcount',   label: 'Stock Count',  icon: 'clipboard' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { key: 'near-expiry-analytics', label: 'Near Expiry Risk',     icon: 'chart' },
      { key: 'financial-analytics',    label: 'Financial Analytics',  icon: 'chart' },
      { key: 'availability-analytics',  label: 'Availability',          icon: 'chart' },
      { key: 'supplychain-analytics',   label: 'Supply Chain',          icon: 'chart' },
      { key: 'efficiency-analytics',    label: 'Efficiency',            icon: 'chart' },
    ],
  },
  {
    label: 'Governance',
    items: [
      { key: 'reconciliation',       label: 'Reconciliation',       icon: 'scale'   },
      { key: 'reconciliation-audit', label: 'Reconciliation Audit', icon: 'eye'     },
      { key: 'recon-compare',        label: 'File Compare',         icon: 'compare' },
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
    compare: (
      <svg viewBox="0 0 16 16" className="fm-nav-icon" aria-hidden="true">
        <rect x="1" y="2" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <rect x="9" y="2" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M4 6H3M4 8H3M4 10H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M12 6H11M12 8H11M12 10H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
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
          <img
            src={falconLogo}
            alt="FalconMed"
            style={{
              width: '100%',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
            }}
          />
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

          {currentPage === 'dashboard'              && <DashboardPage />}
          {currentPage === 'inventory'              && <InventoryExplorerPage />}
          {currentPage === 'inventory-intelligence' && <InventoryIntelligencePage />}
          {currentPage === 'near-expiry-analytics' && <NearExpiryAnalyticsPage />}
          {currentPage === 'financial-analytics'    && <FinancialAnalyticsPage />}
          {currentPage === 'availability-analytics'  && <AvailabilityAnalyticsPage />}
          {currentPage === 'supplychain-analytics'   && <SupplyChainAnalyticsPage />}
          {currentPage === 'efficiency-analytics'    && <InventoryEfficiencyPage />}
          {currentPage === 'supply-chain'           && <SupplyChainPage />}
          {currentPage === 'transactions'           && <InventoryTransactionsPage />}
          {currentPage === 'operations'             && <InventoryOperationsPage />}
          {currentPage === 'patients'               && <PatientRegistryPage />}
          {currentPage === 'stockcount'             && <StockCountPage />}
          {currentPage === 'reconciliation'         && <ReconciliationCasesPage />}
          {currentPage === 'reconciliation-audit'   && <ReconciliationAuditPage />}
          {currentPage === 'recon-compare'          && <ReconCompareEngine />}

          {currentPage === 'drug-search' && (
            <div>
              <div className="fm-page-header">
                <div className="fm-page-header-top">
                  <div>
                    <div className="fm-page-header-meta">Formulary &amp; Inventory</div>
                    <h1 className="fm-page-header-title">Drug search</h1>
                    <p className="fm-page-header-desc">
                      Search 22,940 DOH-registered drugs by name, brand, code,
                      or classification.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {[
                    { label: 'Thiqa',             checked: thiqaOnly,            setter: setThiqaOnly            },
                    { label: 'Basic',             checked: basicOnly,            setter: setBasicOnly            },
                    { label: 'UPP',               checked: uppOnly,              setter: setUppOnly              },
                    { label: 'Active only',       checked: activeOnly,           setter: setActiveOnly           },
                    { label: 'Single ingredient', checked: singleIngredientOnly, setter: setSingleIngredientOnly },
                    { label: 'Combination only',  checked: combinationOnly,      setter: setCombinationOnly      },
                  ].map(({ label, checked, setter }) => (
                    <label
                      key={label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: 'var(--text-sm)',
                        color: checked
                          ? 'var(--color-text-accent)'
                          : 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setter(e.target.checked)
                          runSearch(search, {
                            [Object.keys({
                              thiqaOnly, basicOnly, uppOnly,
                              activeOnly, singleIngredientOnly, combinationOnly,
                            }).find(k => ({
                              thiqaOnly, basicOnly, uppOnly,
                              activeOnly, singleIngredientOnly, combinationOnly,
                            })[k] === checked)]: e.target.checked,
                          })
                        }}
                        style={{
                          accentColor: 'var(--color-primary)',
                          width: '14px',
                          height: '14px',
                        }}
                      />
                      {label}
                    </label>
                  ))}

                  <select
                    value={searchMode}
                    onChange={(e) => {
                      setSearchMode(e.target.value)
                      runSearch(search, { searchMode: e.target.value })
                    }}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border-default)',
                      background: 'var(--color-bg-input)',
                      color: 'var(--color-text-primary)',
                      fontSize: 'var(--text-sm)',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    <option value="all">All fields</option>
                    <option value="generic">Generic only</option>
                    <option value="brand">Brand only</option>
                    <option value="code">Drug code</option>
                  </select>
                </div>
              </div>

              <div style={{ position: 'relative', marginBottom: '16px' }}>
                <input
                  value={search}
                  onChange={(e) => runSearch(e.target.value)}
                  placeholder="Search by drug name, brand, or code..."
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border-default)',
                    background: 'var(--color-bg-input)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--text-md)',
                    fontFamily: 'var(--font-sans)',
                    boxSizing: 'border-box',
                  }}
                />
                {loading && (
                  <span style={{
                    position: 'absolute',
                    right: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-tertiary)',
                  }}>
                    Searching...
                  </span>
                )}
              </div>

              {results.length > 0 && !selectedDrug && (
                <div
                  className="fm-card"
                  style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}
                >
                  <div style={{
                    padding: '8px 14px',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-tertiary)',
                  }}>
                    {results.length} result{results.length !== 1 ? 's' : ''} · select to view full record
                  </div>
                  {results.map((drug) => (
                    <button
                      key={drug.id}
                      onClick={() => handleSelectDrug(drug)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '12px 16px',
                        background: 'transparent',
                        color: 'var(--color-text-primary)',
                        border: 'none',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'var(--color-bg-card-hover)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = 'transparent')
                      }
                    >
                      <div style={{
                        fontWeight: 'var(--font-medium)',
                        fontSize: 'var(--text-base)',
                        color: 'var(--color-text-primary)',
                        marginBottom: '3px',
                      }}>
                        {drug.generic_name}
                      </div>
                      <div style={{
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-text-accent)',
                        marginBottom: '3px',
                      }}>
                        {drug.brand_name} · {drug.strength} · {drug.dosage_form}
                      </div>
                      <div style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-tertiary)',
                        display: 'flex',
                        gap: '12px',
                        flexWrap: 'wrap',
                      }}>
                        <span>Pack: {drug.package_size}</span>
                        <span>AED {drug.price_to_public}</span>
                        {drug.insurance_thiqa && (
                          <span style={{ color: 'var(--color-success)' }}>Thiqa</span>
                        )}
                        {drug.insurance_basic && (
                          <span style={{ color: 'var(--color-success)' }}>Basic</span>
                        )}
                        {drug.upp_scope && <span>UPP: {drug.upp_scope}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {visibleDrug && (
                <DrugCard
                  drug={visibleDrug}
                  onClose={() => {
                    setSelectedDrug(null)
                    setSearch('')
                  }}
                />
              )}
            </div>
          )}

        </div>
      </main>

    </div>
  )
}

function DrugCard({ drug, onClose }) {
  const parsed = parsePackageSize(drug.package_size)
  const calculatedUnitPrice = calculateUnitPrice(
    drug.price_to_public,
    drug.package_size
  )

  const fields = [
    { label: 'Strength',              value: drug.strength                                                           },
    { label: 'Dosage form',           value: drug.dosage_form                                                        },
    { label: 'Package',               value: drug.package_size                                                       },
    { label: 'Detected units',        value: parsed.unitCount || '-'                                                 },
    { label: 'Parse confidence',      value: parsed.confidence                                                       },
    { label: 'Status',                value: drug.is_active ? 'Active' : 'Inactive', highlight: drug.is_active      },
    { label: 'Public price',          value: `AED ${drug.price_to_public}`                                           },
    { label: 'Pharmacy price',        value: `AED ${drug.price_to_pharmacy}`                                         },
    { label: 'Calculated unit price', value: calculatedUnitPrice ? `AED ${calculatedUnitPrice.toFixed(2)}` : '-'    },
    { label: 'Unit public price',     value: drug.unit_price_to_public   ? `AED ${drug.unit_price_to_public}`  : '-'},
    { label: 'Unit pharmacy price',   value: drug.unit_price_to_pharmacy ? `AED ${drug.unit_price_to_pharmacy}`: '-'},
    { label: 'Basic insurance',       value: drug.insurance_basic ? 'Yes' : 'No'                                     },
    { label: 'Thiqa',                 value: drug.insurance_thiqa ? 'Yes' : 'No'                                     },
    { label: 'UPP',                   value: drug.upp_scope    || '-'                                                },
    { label: 'Unit markup',           value: drug.unit_markup  || '-'                                                },
    { label: 'Package markup',        value: drug.package_markup || '-'                                              },
    { label: 'Insurance plan',        value: drug.insurance_plan || '-'                                              },
    { label: 'Dispense mode',         value: drug.dispense_mode  || '-'                                              },
    { label: 'Last change',           value: drug.last_change_date || '-'                                            },
  ]

  return (
    <div className="fm-card">
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1px solid var(--color-border-subtle)',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div>
          <h2 style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 'var(--font-medium)',
            color: 'var(--color-text-primary)',
            margin: 0,
            lineHeight: 1.2,
          }}>
            {drug.generic_name}
          </h2>
          <div style={{
            fontSize: 'var(--text-lg)',
            color: 'var(--color-text-accent)',
            marginTop: '6px',
          }}>
            {drug.brand_name}
          </div>
        </div>
        <button
          onClick={onClose}
          className="fm-btn"
          style={{ fontSize: 'var(--text-xs)', padding: '4px 10px', flexShrink: 0 }}
        >
          ✕ Clear
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '10px',
        marginBottom: '20px',
      }}>
        {fields.map(({ label, value, highlight }) => (
          <div
            key={label}
            style={{
              background: 'var(--color-bg-content)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
            }}
          >
            <div style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '3px',
            }}>
              {label}
            </div>
            <div style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-medium)',
              color: highlight ? 'var(--color-success)' : 'var(--color-text-primary)',
            }}>
              {value || '—'}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        background: 'var(--color-bg-content)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '14px 16px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '10px',
      }}>
        {[
          { label: 'Manufacturer', value: drug.manufacturer },
          { label: 'Agent',        value: drug.agent        },
          { label: 'Raw source',   value: drug.raw_source   },
          { label: 'Drug code',    value: drug.drug_code, mono: true },
        ].map(({ label, value, mono }) => (
          <div key={label}>
            <div style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '3px',
            }}>
              {label}
            </div>
            <div style={{
              fontSize: 'var(--text-sm)',
              color: mono ? 'var(--color-text-accent)' : 'var(--color-text-secondary)',
              fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
            }}>
              {value || 'N/A'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
