import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import PurchaseOrdersPage from './PurchaseOrdersPage'

export default function SupplyChainPage() {
  const [activeTab, setActiveTab] = useState('suppliers')

  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [supplierCode, setSupplierCode] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (activeTab === 'suppliers') {
      loadSuppliers()
    }
  }, [activeTab])

  async function loadSuppliers() {
    setLoading(true)

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Suppliers load error:', error)
      alert(error.message)
      setSuppliers([])
    } else {
      setSuppliers(data || [])
    }

    setLoading(false)
  }

  async function addSupplier() {
    if (!supplierCode.trim() || !supplierName.trim()) {
      alert('Supplier code and supplier name are required.')
      return
    }

    setSaving(true)

    const { error } = await supabase.from('suppliers').insert({
      supplier_code: supplierCode.trim().toUpperCase(),
      supplier_name: supplierName.trim(),
      contact_person: contactPerson.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      status: 'ACTIVE',
    })

    if (error) {
      console.error('Supplier save error:', error)
      alert(error.message)
      setSaving(false)
      return
    }

    setSupplierCode('')
    setSupplierName('')
    setContactPerson('')
    setPhone('')
    setEmail('')

    await loadSuppliers()
    setSaving(false)
  }

  return (
    <div>
      <h2 style={{ fontSize: '42px', marginBottom: '10px' }}>
        Supply Chain Foundation
      </h2>

      <p style={{ color: '#94a3b8', fontSize: '18px', marginBottom: '20px' }}>
        Phase 9A — Suppliers and Purchase Orders
      </p>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
        <button
          onClick={() => setActiveTab('suppliers')}
          style={{
            padding: '12px 20px',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: activeTab === 'suppliers' ? 'bold' : 'normal',
          }}
        >
          Suppliers
        </button>

        <button
          onClick={() => setActiveTab('purchase-orders')}
          style={{
            padding: '12px 20px',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight:
              activeTab === 'purchase-orders' ? 'bold' : 'normal',
          }}
        >
          Purchase Orders
        </button>
      </div>

      {activeTab === 'purchase-orders' && <PurchaseOrdersPage />}

      {activeTab === 'suppliers' && (
        <>
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '20px',
              padding: '24px',
              marginBottom: '28px',
            }}
          >
            <h3 style={{ fontSize: '28px', marginBottom: '18px' }}>
              Add Supplier
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '14px',
              }}
            >
              <input
                value={supplierCode}
                onChange={(e) => setSupplierCode(e.target.value)}
                placeholder="Supplier Code e.g. JULPHAR"
                style={inputStyle}
              />

              <input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Supplier Name"
                style={inputStyle}
              />

              <input
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="Contact Person"
                style={inputStyle}
              />

              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone"
                style={inputStyle}
              />

              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                style={inputStyle}
              />
            </div>

            <button
              onClick={addSupplier}
              disabled={saving}
              style={{
                marginTop: '18px',
                padding: '12px 22px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
              }}
            >
              {saving ? 'Saving...' : 'Save Supplier'}
            </button>
          </div>

          <div
            style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: '20px',
              padding: '24px',
            }}
          >
            <h3 style={{ fontSize: '28px', marginBottom: '18px' }}>
              Suppliers List
            </h3>

            {loading && <p>Loading suppliers...</p>}

            {!loading && suppliers.length === 0 && (
              <p style={{ color: '#94a3b8' }}>No suppliers found.</p>
            )}

            {!loading && suppliers.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Code</th>
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Contact</th>
                    <th style={thStyle}>Phone</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <tr key={supplier.id}>
                      <td style={tdStyle}>{supplier.supplier_code}</td>
                      <td style={tdStyle}>{supplier.supplier_name}</td>
                      <td style={tdStyle}>{supplier.contact_person || '-'}</td>
                      <td style={tdStyle}>{supplier.phone || '-'}</td>
                      <td style={tdStyle}>{supplier.email || '-'}</td>
                      <td style={tdStyle}>{supplier.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const inputStyle = {
  padding: '14px',
  borderRadius: '12px',
  border: '1px solid #334155',
  background: '#020617',
  color: 'white',
  fontSize: '16px',
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