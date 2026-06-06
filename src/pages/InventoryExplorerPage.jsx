import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function InventoryExplorerPage() {
  const [pharmacies, setPharmacies] = useState([])
  const [selectedPharmacy, setSelectedPharmacy] = useState('')
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadPharmacies()
  }, [])

  async function loadPharmacies() {
    const { data, error } = await supabase
      .from('pharmacies')
      .select('id, name, code, is_active')
      .order('name')

    if (error) {
      console.error('Pharmacies error:', error)
      return
    }

    setPharmacies(data || [])

    if (data?.length) {
      setSelectedPharmacy(data[0].id)
      loadInventory(data[0].id)
    }
  }

  async function loadInventory(pharmacyId) {
    setLoading(true)

    const { data: inventoryData, error: inventoryError } = await supabase
      .from('inventory')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('quantity_on_hand', { ascending: false })

    if (inventoryError) {
      console.error('Inventory error:', inventoryError)
      setInventory([])
      setLoading(false)
      return
    }

    const drugCodes = [
      ...new Set((inventoryData || []).map((item) => item.drug_code)),
    ]

    if (drugCodes.length === 0) {
      setInventory([])
      setLoading(false)
      return
    }

    const { data: drugData, error: drugError } = await supabase
      .from('drug_master_reference')
      .select('drug_code, generic_name, brand_name, strength, dosage_form, unit_price_to_pharmacy')
      .in('drug_code', drugCodes)

    if (drugError) {
      console.error('Drug reference error:', drugError)
    }

    const drugMap = new Map(
      (drugData || []).map((drug) => [drug.drug_code, drug])
    )

    const merged = (inventoryData || []).map((item) => ({
      ...item,
      drug: drugMap.get(item.drug_code) || null,
    }))

    setInventory(merged)
    setLoading(false)
  }

  const totalItems = inventory.length

  const totalQuantity = inventory.reduce(
    (sum, item) => sum + Number(item.quantity_on_hand || 0),
    0
  )

  const totalInventoryValue = inventory.reduce((sum, item) => {
    const qty = Number(item.quantity_on_hand || 0)
    const unitCost = Number(item.drug?.unit_price_to_pharmacy || 0)

    return sum + qty * unitCost
  }, 0)

  const lowStockCount = inventory.filter(
    (item) =>
      Number(item.quantity_on_hand || 0) <= Number(item.minimum_stock || 0)
  ).length

  const outOfStockCount = inventory.filter(
    (item) => Number(item.quantity_on_hand || 0) === 0
  ).length

  const filteredInventory = inventory.filter((item) => {
    const search = searchTerm.toLowerCase().trim()

    if (!search) return true

    return (
      item.drug_code?.toLowerCase().includes(search) ||
      item.drug?.generic_name?.toLowerCase().includes(search) ||
      item.drug?.brand_name?.toLowerCase().includes(search)
    )
  })

  return (
    <div style={{ padding: '24px', color: 'white' }}>
      <h1>Inventory Explorer</h1>

      <select
        value={selectedPharmacy}
        onChange={(e) => {
          setSelectedPharmacy(e.target.value)
          setSearchTerm('')
          loadInventory(e.target.value)
        }}
        style={{
          padding: '10px',
          borderRadius: '8px',
          marginBottom: '24px',
          fontSize: '16px',
          minWidth: '320px',
        }}
      >
        <option value="">Select pharmacy</option>
        {pharmacies.map((pharmacy) => (
          <option key={pharmacy.id} value={pharmacy.id}>
            {pharmacy.name} ({pharmacy.code})
          </option>
        ))}
      </select>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div style={cardStyle}>
          <div>Total Items</div>
          <h2>{totalItems}</h2>
        </div>

        <div style={cardStyle}>
          <div>Total Quantity</div>
          <h2>{totalQuantity}</h2>
        </div>

        <div style={cardStyle}>
          <div>Inventory Value</div>
          <h2>AED {totalInventoryValue.toFixed(2)}</h2>
        </div>

        <div style={cardStyle}>
          <div>Low Stock</div>
          <h2>{lowStockCount}</h2>
        </div>

        <div style={cardStyle}>
          <div>Out Of Stock</div>
          <h2>{outOfStockCount}</h2>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search by Drug Code, Generic or Brand..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{
          width: '100%',
          padding: '12px',
          marginBottom: '20px',
          borderRadius: '8px',
          border: '1px solid #334155',
          background: '#0f172a',
          color: 'white',
          fontSize: '14px',
        }}
      />

      {loading && <div>Loading inventory...</div>}

      {!loading && inventory.length === 0 && (
        <div style={{ color: '#94a3b8', marginTop: '20px' }}>
          No inventory found for this pharmacy.
        </div>
      )}

      {!loading && inventory.length > 0 && filteredInventory.length === 0 && (
        <div style={{ color: '#94a3b8', marginTop: '20px' }}>
          No matching inventory found.
        </div>
      )}

      {!loading && filteredInventory.length > 0 && (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            background: '#0f172a',
            borderRadius: '16px',
            overflow: 'hidden',
          }}
        >
          <thead>
            <tr style={{ background: '#1e293b' }}>
              <th style={thStyle}>Drug Code</th>
              <th style={thStyle}>Generic</th>
              <th style={thStyle}>Brand</th>
              <th style={thStyle}>Strength</th>
              <th style={thStyle}>Form</th>
              <th style={thStyle}>Quantity</th>
              <th style={thStyle}>Min</th>
              <th style={thStyle}>Max</th>
            </tr>
          </thead>

          <tbody>
            {filteredInventory.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={tdStyle}>{item.drug_code}</td>
                <td style={tdStyle}>{item.drug?.generic_name || '-'}</td>
                <td style={tdStyle}>{item.drug?.brand_name || '-'}</td>
                <td style={tdStyle}>{item.drug?.strength || '-'}</td>
                <td style={tdStyle}>{item.drug?.dosage_form || '-'}</td>
                <td style={tdStyle}>{item.quantity_on_hand}</td>
                <td style={tdStyle}>{item.minimum_stock}</td>
                <td style={tdStyle}>{item.maximum_stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const thStyle = {
  textAlign: 'left',
  padding: '14px',
  color: 'white',
  borderBottom: '1px solid #334155',
}

const tdStyle = {
  padding: '14px',
  color: '#cbd5e1',
  borderBottom: '1px solid #1e293b',
}

const cardStyle = {
  background: '#0f172a',
  padding: '20px',
  borderRadius: '12px',
  border: '1px solid #334155',
  color: 'white',
}