import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const TYPE_COLORS = {
  DISPENSE: {
    color: 'var(--color-primary)',
    background: 'rgba(24,95,165,0.12)',
    border: '1px solid rgba(24,95,165,0.30)',
  },
  TRANSFER_IN: {
    color: 'var(--color-success)',
    background: 'rgba(29,158,117,0.12)',
    border: '1px solid rgba(29,158,117,0.30)',
  },
  TRANSFER_OUT: {
    color: 'var(--color-warning-mid)',
    background: 'rgba(186,117,23,0.12)',
    border: '1px solid rgba(186,117,23,0.30)',
  },
  ADJUSTMENT_PLUS: {
    color: 'var(--color-success)',
    background: 'rgba(29,158,117,0.12)',
    border: '1px solid rgba(29,158,117,0.30)',
  },
  ADJUSTMENT_MINUS: {
    color: 'var(--color-danger-mid)',
    background: 'rgba(163,45,45,0.12)',
    border: '1px solid rgba(163,45,45,0.30)',
  },
  OPENING_BALANCE: {
    color: 'var(--color-text-accent)',
    background: 'rgba(24,95,165,0.08)',
    border: '1px solid rgba(24,95,165,0.20)',
  },
}

export default function InventoryTransactionsPage() {
  const [transactions, setTransactions] = useState([])
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [pharmacyFilter, setPharmacyFilter] = useState('ALL')
  const [dateFilter, setDateFilter] = useState('')

  useEffect(() => {
    loadTransactions()
  }, [])

  async function loadTransactions() {
    setLoading(true)
    setSelectedTransaction(null)

    const { data: transactionData, error } = await supabase
      .from('inventory_transactions')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Transactions error:', error)
      setTransactions([])
      setLoading(false)
      return
    }

    const drugCodes = [
      ...new Set(
        (transactionData || []).map((item) => item.drug_code).filter(Boolean)
      ),
    ]

    const pharmacyIds = [
      ...new Set(
        (transactionData || [])
          .flatMap((item) => [
            item.source_pharmacy_id,
            item.destination_pharmacy_id,
          ])
          .filter(Boolean)
      ),
    ]

    let drugMap = new Map()
    let pharmacyMap = new Map()

    if (drugCodes.length > 0) {
      const { data: drugData } = await supabase
        .from('drug_master_reference')
        .select('drug_code, generic_name, brand_name, strength')
        .in('drug_code', drugCodes)

      drugMap = new Map(
        (drugData || []).map((drug) => [drug.drug_code, drug])
      )
    }

    if (pharmacyIds.length > 0) {
      const { data: pharmacyData } = await supabase
        .from('pharmacies')
        .select('id, name, code')
        .in('id', pharmacyIds)

      pharmacyMap = new Map(
        (pharmacyData || []).map((pharmacy) => [pharmacy.id, pharmacy])
      )
    }

    const merged = (transactionData || []).map((item) => ({
      ...item,
      drug: drugMap.get(item.drug_code) || null,
      sourcePharmacy: pharmacyMap.get(item.source_pharmacy_id) || null,
      destinationPharmacy:
        pharmacyMap.get(item.destination_pharmacy_id) || null,
    }))

    setTransactions(merged)
    setLoading(false)
  }

  function getTransactionPharmacyName(item) {
    if (item.transaction_type === 'TRANSFER_OUT') {
      return item.sourcePharmacy?.name || '-'
    }
    if (item.transaction_type === 'TRANSFER_IN') {
      return item.destinationPharmacy?.name || '-'
    }
    return item.sourcePharmacy?.name || item.destinationPharmacy?.name || '-'
  }

  const filteredTransactions = useMemo(() => {
    return transactions.filter((item) => {
      const pharmacyName = getTransactionPharmacyName(item)
      const matchType =
        typeFilter === 'ALL' || item.transaction_type === typeFilter
      const matchPharmacy =
        pharmacyFilter === 'ALL' || pharmacyName === pharmacyFilter
      const matchDate =
        !dateFilter ||
        (item.created_at &&
          new Date(item.created_at).toISOString().slice(0, 10) === dateFilter)
      return matchType && matchPharmacy && matchDate
    })
  }, [transactions, typeFilter, pharmacyFilter, dateFilter])

  const transactionsWithRunningBalance = useMemo(() => {
    const balances = {}
    return filteredTransactions.map((item) => {
      const pharmacyKey =
        item.transaction_type === 'TRANSFER_IN'
          ? item.destination_pharmacy_id
          : item.source_pharmacy_id || item.destination_pharmacy_id
      const key = `${pharmacyKey || 'NO_PHARMACY'}-${
        item.drug_code || 'NO_DRUG'
      }`
      const qty = Number(item.quantity || 0)
      if (!balances[key]) balances[key] = 0
      if (
        item.transaction_type === 'OPENING_BALANCE' ||
        item.transaction_type === 'ADJUSTMENT_PLUS' ||
        item.transaction_type === 'TRANSFER_IN'
      ) {
        balances[key] += qty
      }
      if (
        item.transaction_type === 'DISPENSE' ||
        item.transaction_type === 'ADJUSTMENT_MINUS' ||
        item.transaction_type === 'TRANSFER_OUT'
      ) {
        balances[key] -= qty
      }
      return { ...item, running_balance: balances[key] }
    })
  }, [filteredTransactions])

  const transactionTypes = useMemo(() => {
    return [
      'ALL',
      ...new Set(
        transactions.map((item) => item.transaction_type).filter(Boolean)
      ),
    ]
  }, [transactions])

  const pharmacies = useMemo(() => {
    return [
      'ALL',
      ...new Set(
        transactions
          .map((item) => getTransactionPharmacyName(item))
          .filter((name) => name && name !== '-')
      ),
    ]
  }, [transactions])

  const typeCounts = useMemo(() => {
    const counts = {}
    transactions.forEach((t) => {
      const type = t.transaction_type || 'UNKNOWN'
      counts[type] = (counts[type] || 0) + 1
    })
    return counts
  }, [transactions])

  const displayRows = transactionsWithRunningBalance.slice().reverse()
  const hasActiveFilter =
    typeFilter !== 'ALL' || pharmacyFilter !== 'ALL' || dateFilter !== ''

  return (
    <div>
      <div className="fm-page-header">
        <div className="fm-page-header-top">
          <div>
            <div className="fm-page-header-meta">Operations</div>
            <h1 className="fm-page-header-title">Inventory transactions</h1>
            <p className="fm-page-header-desc">
              Complete transaction ledger with running balance, transfer
              routing, and dispensing history.
            </p>
          </div>
          <div className="fm-page-header-actions">
            {hasActiveFilter && (
              <button
                className="fm-btn"
                onClick={() => {
                  setTypeFilter('ALL')
                  setPharmacyFilter('ALL')
                  setDateFilter('')
                }}
              >
                Clear filters
              </button>
            )}
            <button className="fm-btn" onClick={loadTransactions}>
              Refresh
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ display: 'grid', gap: '5px' }}>
            <label
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Transaction type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setSelectedTransaction(null)
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-base)',
                fontFamily: 'var(--font-sans)',
                minWidth: '180px',
              }}
            >
              {transactionTypes.map((type) => (
                <option key={type} value={type}>
                  {type === 'ALL' ? 'All types' : type}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gap: '5px' }}>
            <label
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Pharmacy
            </label>
            <select
              value={pharmacyFilter}
              onChange={(e) => {
                setPharmacyFilter(e.target.value)
                setSelectedTransaction(null)
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-base)',
                fontFamily: 'var(--font-sans)',
                minWidth: '220px',
              }}
            >
              {pharmacies.map((pharmacy) => (
                <option key={pharmacy} value={pharmacy}>
                  {pharmacy === 'ALL' ? 'All pharmacies' : pharmacy}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gap: '5px' }}>
            <label
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Date
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value)
                setSelectedTransaction(null)
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-base)',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </div>
        </div>
      </div>

      {!loading && transactions.length > 0 && (
        <div className="fm-grid-kpi" style={{ marginBottom: '20px' }}>
          <TxKpiCard
            label="Total transactions"
            value={transactions.length.toLocaleString()}
            color="var(--color-text-accent)"
            barColor="var(--color-primary)"
          />
          <TxKpiCard
            label="Showing"
            value={displayRows.length.toLocaleString()}
            color="var(--color-text-accent)"
            barColor="var(--color-primary)"
          />
          {Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([type, count]) => {
              const c = TYPE_COLORS[type]
              return (
                <TxKpiCard
                  key={type}
                  label={type.replace(/_/g, ' ').toLowerCase()}
                  value={count.toLocaleString()}
                  color={c?.color ?? 'var(--color-text-secondary)'}
                  barColor={c?.color ?? 'var(--color-text-secondary)'}
                />
              )
            })}
        </div>
      )}

      {loading && (
        <div
          className="fm-card"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Loading transactions...
        </div>
      )}

      {!loading && displayRows.length === 0 && (
        <div className="fm-empty-state">
          <div className="fm-empty-state-title">No transactions found</div>
          <div className="fm-empty-state-desc">
            Try adjusting your filters or refreshing the data.
          </div>
        </div>
      )}

      {!loading && displayRows.length > 0 && (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div
            className="fm-card"
            style={{
              padding: 0,
              overflow: 'hidden',
              flex: selectedTransaction ? '1 1 65%' : '1 1 100%',
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: '1px solid var(--color-border-subtle)',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-primary)',
                }}
              >
                <strong>{displayRows.length.toLocaleString()}</strong>
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  {' '}
                  transactions
                </span>
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                Most recent first · Click row to inspect
              </span>
            </div>

            <div style={{ maxHeight: '560px', overflow: 'auto' }}>
              <table className="fm-table" style={{ minWidth: '1100px' }}>
                <thead>
                  <tr>
                    {[
                      'Date',
                      'Type',
                      'Pharmacy',
                      'From',
                      'To',
                      'Drug',
                      'Brand',
                      'Qty',
                      'Balance',
                      'Code',
                      'Notes',
                    ].map((col) => (
                      <th
                        key={col}
                        style={{
                          position: 'sticky',
                          top: 0,
                          zIndex: 2,
                          background: 'var(--color-bg-card)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() =>
                        setSelectedTransaction(
                          selectedTransaction?.id === item.id ? null : item
                        )
                      }
                      style={{
                        cursor: 'pointer',
                        background:
                          selectedTransaction?.id === item.id
                            ? 'var(--color-bg-card-hover)'
                            : undefined,
                      }}
                    >
                      <td
                        className="fm-table-muted"
                        style={{
                          fontSize: 'var(--text-xs)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.created_at
                          ? new Date(item.created_at).toLocaleString()
                          : '-'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <TypeBadge type={item.transaction_type} />
                      </td>
                      <td
                        className="fm-table-muted"
                        style={{
                          whiteSpace: 'nowrap',
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        {getTransactionPharmacyName(item)}
                      </td>
                      <td
                        className="fm-table-muted"
                        style={{
                          fontSize: 'var(--text-xs)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.sourcePharmacy?.name || '—'}
                      </td>
                      <td
                        className="fm-table-muted"
                        style={{
                          fontSize: 'var(--text-xs)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.destinationPharmacy?.name || '—'}
                      </td>
                      <td
                        style={{ whiteSpace: 'normal', minWidth: '160px' }}
                      >
                        <div
                          style={{
                            fontWeight: 'var(--font-medium)',
                            color: 'var(--color-text-primary)',
                            lineHeight: 1.3,
                          }}
                        >
                          {item.drug?.generic_name || '-'}
                        </div>
                        {item.drug?.strength && (
                          <div
                            style={{
                              fontSize: 'var(--text-xs)',
                              color: 'var(--color-text-secondary)',
                              marginTop: '2px',
                            }}
                          >
                            {item.drug.strength}
                          </div>
                        )}
                      </td>
                      <td
                        className="fm-table-muted"
                        style={{
                          fontSize: 'var(--text-xs)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.drug?.brand_name || '-'}
                      </td>
                      <td
                        style={{
                          fontWeight: 'var(--font-medium)',
                          color: 'var(--color-text-primary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {Number(item.quantity || 0).toLocaleString()}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <BalanceValue value={item.running_balance} />
                      </td>
                      <td>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 'var(--text-xs)',
                            color: 'var(--color-text-accent)',
                          }}
                        >
                          {item.drug_code || '-'}
                        </span>
                      </td>
                      <td
                        className="fm-table-muted"
                        style={{
                          fontSize: 'var(--text-xs)',
                          maxWidth: '160px',
                          whiteSpace: 'normal',
                          lineHeight: 1.4,
                        }}
                      >
                        {item.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedTransaction && (
            <div
              className="fm-card"
              style={{ flex: '0 0 300px', minWidth: '260px' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <h3
                  style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 'var(--font-medium)',
                    color: 'var(--color-text-primary)',
                    margin: 0,
                  }}
                >
                  Transaction detail
                </h3>
                <button
                  className="fm-btn"
                  style={{ padding: '2px 8px', fontSize: 'var(--text-xs)' }}
                  onClick={() => setSelectedTransaction(null)}
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <TxDetailField label="Type">
                  <TypeBadge type={selectedTransaction.transaction_type} />
                </TxDetailField>
                <TxDetailField
                  label="Date"
                  value={
                    selectedTransaction.created_at
                      ? new Date(
                          selectedTransaction.created_at
                        ).toLocaleString()
                      : '-'
                  }
                />
                <TxDetailField
                  label="Pharmacy"
                  value={getTransactionPharmacyName(selectedTransaction)}
                />
                <TxDetailField
                  label="From"
                  value={selectedTransaction.sourcePharmacy?.name || '—'}
                />
                <TxDetailField
                  label="To"
                  value={
                    selectedTransaction.destinationPharmacy?.name || '—'
                  }
                />
                <TxDetailField
                  label="Drug"
                  value={selectedTransaction.drug?.generic_name || '-'}
                />
                <TxDetailField
                  label="Brand"
                  value={selectedTransaction.drug?.brand_name || '-'}
                />
                <TxDetailField
                  label="Strength"
                  value={selectedTransaction.drug?.strength || '-'}
                />
                <TxDetailField
                  label="Quantity"
                  value={Number(
                    selectedTransaction.quantity || 0
                  ).toLocaleString()}
                />
                <TxDetailField label="Running balance">
                  <BalanceValue value={selectedTransaction.running_balance} />
                </TxDetailField>
                <TxDetailField label="Drug code">
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-accent)',
                    }}
                  >
                    {selectedTransaction.drug_code || '-'}
                  </span>
                </TxDetailField>
                {selectedTransaction.notes && (
                  <TxDetailField
                    label="Notes"
                    value={selectedTransaction.notes}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TxKpiCard({ label, value, color, barColor }) {
  return (
    <div className="fm-kpi-card">
      <div className="fm-kpi-label">{label}</div>
      <div className="fm-kpi-value" style={{ color }}>
        {value}
      </div>
      <div className="fm-kpi-bar">
        <div
          className="fm-kpi-bar-fill"
          style={{ width: '60%', background: barColor }}
        />
      </div>
    </div>
  )
}

function TypeBadge({ type }) {
  const style = TYPE_COLORS[type] ?? {
    color: 'var(--color-text-secondary)',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--color-border-default)',
  }
  const label = type ? type.replace(/_/g, ' ') : '—'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--font-medium)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </span>
  )
}

function BalanceValue({ value }) {
  const n = Number(value || 0)
  const color =
    n > 0
      ? 'var(--color-success)'
      : n < 0
      ? 'var(--color-danger-mid)'
      : 'var(--color-text-secondary)'
  return (
    <span
      style={{
        fontWeight: 'var(--font-medium)',
        color,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {n.toLocaleString()}
    </span>
  )
}

function TxDetailField({ label, value, children }) {
  return (
    <div>
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '3px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-primary)',
          lineHeight: 1.4,
        }}
      >
        {children ?? value ?? '—'}
      </div>
    </div>
  )
}
