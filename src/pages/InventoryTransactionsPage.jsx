import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

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
      ...new Set((transactionData || []).map((item) => item.drug_code).filter(Boolean)),
    ]

    const pharmacyIds = [
      ...new Set(
        (transactionData || [])
          .flatMap((item) => [item.source_pharmacy_id, item.destination_pharmacy_id])
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

      drugMap = new Map((drugData || []).map((drug) => [drug.drug_code, drug]))
    }

    if (pharmacyIds.length > 0) {
      const { data: pharmacyData } = await supabase
        .from('pharmacies')
        .select('id, name, code')
        .in('id', pharmacyIds)

      pharmacyMap = new Map((pharmacyData || []).map((pharmacy) => [pharmacy.id, pharmacy]))
    }

    const merged = (transactionData || []).map((item) => ({
      ...item,
      drug: drugMap.get(item.drug_code) || null,
      sourcePharmacy: pharmacyMap.get(item.source_pharmacy_id) || null,
      destinationPharmacy: pharmacyMap.get(item.destination_pharmacy_id) || null,
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

      const key = `${pharmacyKey || 'NO_PHARMACY'}-${item.drug_code || 'NO_DRUG'}`
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

      return {
        ...item,
        running_balance: balances[key],
      }
    })
  }, [filteredTransactions])

  const transactionTypes = useMemo(() => {
    return [
      'ALL',
      ...new Set(transactions.map((item) => item.transaction_type).filter(Boolean)),
    ]
  }, [transactions])

  const pharmacies = useMemo(() => {
    return [
      'ALL',
      ...new Set(transactions.map((item) => getTransactionPharmacyName(item)).filter((name) => name && name !== '-')),
    ]
  }, [transactions])

  return (
    <div style={{ padding: '24px', color: 'white' }}>
      <h1>Inventory Transactions</h1>

      <div style={filterContainerStyle}>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={inputStyle}>
          {transactionTypes.map((type) => (
            <option key={type} value={type}>
              {type === 'ALL' ? 'All Types' : type}
            </option>
          ))}
        </select>

        <select value={pharmacyFilter} onChange={(e) => setPharmacyFilter(e.target.value)} style={inputStyle}>
          {pharmacies.map((pharmacy) => (
            <option key={pharmacy} value={pharmacy}>
              {pharmacy === 'ALL' ? 'All Pharmacies' : pharmacy}
            </option>
          ))}
        </select>

        <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={inputStyle} />

        <button onClick={loadTransactions} style={buttonStyle}>
          Refresh
        </button>
      </div>

      {loading && <div>Loading transactions...</div>}

      {!loading && transactionsWithRunningBalance.length === 0 && (
        <div style={{ color: '#94a3b8' }}>No transactions found.</div>
      )}

      {!loading && transactionsWithRunningBalance.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: '#1e293b' }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Pharmacy</th>
                <th style={thStyle}>From</th>
                <th style={thStyle}>To</th>
                <th style={thStyle}>Drug</th>
                <th style={thStyle}>Brand</th>
                <th style={thStyle}>Strength</th>
                <th style={thStyle}>Qty</th>
                <th style={thStyle}>Running Balance</th>
                <th style={thStyle}>Drug Code</th>
                <th style={thStyle}>Notes</th>
              </tr>
            </thead>

            <tbody>
              {transactionsWithRunningBalance
                .slice()
                .reverse()
                .map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedTransaction(item)}
                    style={{
                      borderBottom: '1px solid #1e293b',
                      cursor: 'pointer',
                    }}
                  >
                    <td style={tdStyle}>
                      {item.created_at ? new Date(item.created_at).toLocaleString() : '-'}
                    </td>
                    <td style={tdStyle}>{item.transaction_type || '-'}</td>
                    <td style={tdStyle}>{getTransactionPharmacyName(item)}</td>
                    <td style={tdStyle}>{item.sourcePharmacy?.name || '-'}</td>
                    <td style={tdStyle}>{item.destinationPharmacy?.name || '-'}</td>
                    <td style={tdStyle}>{item.drug?.generic_name || '-'}</td>
                    <td style={tdStyle}>{item.drug?.brand_name || '-'}</td>
                    <td style={tdStyle}>{item.drug?.strength || '-'}</td>
                    <td style={tdStyle}>{item.quantity}</td>
                    <td style={tdStyle}>{item.running_balance}</td>
                    <td style={tdStyle}>{item.drug_code || '-'}</td>
                    <td style={tdStyle}>{item.notes || '-'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedTransaction && (
        <div onClick={() => setSelectedTransaction(null)} style={modalOverlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
            <h2>Transaction Details</h2>

            <p><strong>Type:</strong> {selectedTransaction.transaction_type || '-'}</p>
            <p><strong>Date:</strong> {selectedTransaction.created_at ? new Date(selectedTransaction.created_at).toLocaleString() : '-'}</p>
            <p><strong>Pharmacy:</strong> {getTransactionPharmacyName(selectedTransaction)}</p>
            <p><strong>From:</strong> {selectedTransaction.sourcePharmacy?.name || '-'}</p>
            <p><strong>To:</strong> {selectedTransaction.destinationPharmacy?.name || '-'}</p>
            <p><strong>Drug:</strong> {selectedTransaction.drug?.generic_name || '-'}</p>
            <p><strong>Brand:</strong> {selectedTransaction.drug?.brand_name || '-'}</p>
            <p><strong>Strength:</strong> {selectedTransaction.drug?.strength || '-'}</p>
            <p><strong>Quantity:</strong> {selectedTransaction.quantity}</p>
            <p><strong>Running Balance:</strong> {selectedTransaction.running_balance}</p>
            <p><strong>Drug Code:</strong> {selectedTransaction.drug_code || '-'}</p>
            <p><strong>Notes:</strong> {selectedTransaction.notes || '-'}</p>

            <button onClick={() => setSelectedTransaction(null)} style={buttonStyle}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const filterContainerStyle = {
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
  marginBottom: '20px',
  background: '#0f172a',
  padding: '16px',
  borderRadius: '16px',
  border: '1px solid #1e293b',
}

const inputStyle = {
  background: '#020617',
  color: 'white',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '10px 12px',
}

const buttonStyle = {
  background: '#2563eb',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  padding: '10px 16px',
  cursor: 'pointer',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  background: '#0f172a',
  borderRadius: '16px',
  overflow: 'hidden',
  minWidth: '1300px',
}

const thStyle = {
  textAlign: 'left',
  padding: '14px',
  color: 'white',
  borderBottom: '1px solid #334155',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '14px',
  color: '#cbd5e1',
  borderBottom: '1px solid #1e293b',
  whiteSpace: 'nowrap',
}

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
}

const modalStyle = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: '16px',
  padding: '24px',
  minWidth: '520px',
  color: 'white',
}