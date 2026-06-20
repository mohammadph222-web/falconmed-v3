import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function PurchaseOrdersPage() {
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [pharmacies, setPharmacies] = useState([])

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [poNumber, setPoNumber] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [pharmacyId, setPharmacyId] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const { data: suppliersData, error: suppliersError } = await supabase
      .from('suppliers')
      .select('*')
      .order('supplier_name', { ascending: true })

    if (suppliersError) {
      console.error('Suppliers error:', suppliersError)
      alert(suppliersError.message)
    }

    const { data: pharmaciesData, error: pharmaciesError } = await supabase
      .from('pharmacies')
      .select('*')
      .order('name', { ascending: true })

    if (pharmaciesError) {
      console.error('Pharmacies error:', pharmaciesError)
      alert(pharmaciesError.message)
    }

    const { data: poData, error: poError } = await supabase
      .from('purchase_orders')
      .select(`
        *,
        suppliers (
          supplier_code,
          supplier_name
        ),
        pharmacies (
          name
        )
      `)
      .order('created_at', { ascending: false })

    if (poError) {
      console.error('Purchase orders error:', poError)
      alert(poError.message)
    }

    setSuppliers(suppliersData || [])
    setPharmacies(pharmaciesData || [])
    setPurchaseOrders(poData || [])

    setLoading(false)
  }

  async function createPurchaseOrder() {
    if (!poNumber.trim() || !supplierId || !pharmacyId) {
      alert('PO number, supplier, and pharmacy are required.')
      return
    }

    setSaving(true)

    const { error } = await supabase.from('purchase_orders').insert({
      po_number: poNumber.trim().toUpperCase(),
      supplier_id: supplierId,
      pharmacy_id: pharmacyId,
      status: 'DRAFT',
      total_amount: 0,
      notes: notes.trim() || null,
    })

    if (error) {
      console.error('Create PO error:', error)
      alert(error.message)
      setSaving(false)
      return
    }

    setPoNumber('')
    setSupplierId('')
    setPharmacyId('')
    setNotes('')

    await loadData()
    setSaving(false)
  }

  return (
    <div>
      <h3 style={{ fontSize: '32px', marginBottom: '10px' }}>
        Purchase Orders
      </h3>

      <p style={{ color: '#94a3b8', fontSize: '17px', marginBottom: '24px' }}>
        Create and view purchase order headers.
      </p>

      <div style={cardStyle}>
        <h3 style={{ fontSize: '26px', marginBottom: '18px' }}>
          Create Purchase Order
        </h3>

        <div style={gridStyle}>
          <input
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
            placeholder="PO Number e.g. PO-2026-0001"
            style={inputStyle}
          />

          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select Supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.supplier_code} — {supplier.supplier_name}
              </option>
            ))}
          </select>

          <select
            value={pharmacyId}
            onChange={(e) => setPharmacyId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select Pharmacy</option>
            {pharmacies.map((pharmacy) => (
              <option key={pharmacy.id} value={pharmacy.id}>
                {pharmacy.name}
              </option>
            ))}
          </select>

          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            style={inputStyle}
          />
        </div>

        <button
          onClick={createPurchaseOrder}
          disabled={saving}
          style={buttonStyle}
        >
          {saving ? 'Saving...' : 'Create PO'}
        </button>
      </div>

      <div style={cardStyle}>
        <h3 style={{ fontSize: '26px', marginBottom: '18px' }}>
          Purchase Orders List
        </h3>

        {loading && <p>Loading purchase orders...</p>}

        {!loading && purchaseOrders.length === 0 && (
          <p style={{ color: '#94a3b8' }}>No purchase orders found.</p>
        )}

        {!loading && purchaseOrders.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>PO Number</th>
                <th style={thStyle}>Supplier</th>
                <th style={thStyle}>Pharmacy</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Total</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => (
                <tr key={po.id}>
                  <td style={tdStyle}>{po.po_number}</td>
                  <td style={tdStyle}>
                    {po.suppliers?.supplier_name || '-'}
                  </td>
                  <td style={tdStyle}>
                    {po.pharmacies?.name || '-'}
                  </td>
                  <td style={tdStyle}>{po.po_date}</td>
                  <td style={tdStyle}>{po.status}</td>
                  <td style={tdStyle}>AED {po.total_amount || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const cardStyle = {
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '20px',
  padding: '24px',
  marginBottom: '28px',
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '14px',
}

const inputStyle = {
  padding: '14px',
  borderRadius: '12px',
  border: '1px solid #334155',
  background: '#020617',
  color: 'white',
  fontSize: '16px',
}

const buttonStyle = {
  marginTop: '18px',
  padding: '12px 22px',
  borderRadius: '12px',
  border: 'none',
  cursor: 'pointer',
  fontSize: '16px',
  fontWeight: 'bold',
}

const thStyle = {
  textAlign: 'left',
  padding: '12px',
  borderBottom: '1px solid #334155',
  color: '#93c5fd',
}

const tdStyle = {
  padding: '12px',
  borderBottom: '1px solid #1e293b',
  color: '#e5e7eb',
}