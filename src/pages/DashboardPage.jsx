import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    pharmacies: 0,
    inventoryItems: 0,
    totalQuantity: 0,
    totalValue: 0,
    lowStock: 0,
    todayTransactions: 0,
  })

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)

    const { data: pharmacies } = await supabase
      .from('pharmacies')
      .select('id')

    const { data: inventory } = await supabase
      .from('inventory')
      .select('*')

    const drugCodes = [
      ...new Set((inventory || []).map((item) => item.drug_code)),
    ]

    let drugMap = new Map()

    if (drugCodes.length > 0) {
      const { data: drugs } = await supabase
        .from('drug_master_reference')
        .select('drug_code, unit_price_to_pharmacy')
        .in('drug_code', drugCodes)

      drugMap = new Map(
        (drugs || []).map((drug) => [drug.drug_code, drug])
      )
    }

    const totalQuantity = (inventory || []).reduce(
      (sum, item) => sum + Number(item.quantity_on_hand || 0),
      0
    )

    const totalValue = (inventory || []).reduce((sum, item) => {
      const qty = Number(item.quantity_on_hand || 0)
      const price = Number(
        drugMap.get(item.drug_code)?.unit_price_to_pharmacy || 0
      )

      return sum + qty * price
    }, 0)

    const lowStock = (inventory || []).filter(
      (item) =>
        Number(item.quantity_on_hand || 0) <=
        Number(item.minimum_stock || 0)
    ).length

    const today = new Date().toISOString().slice(0, 10)

    const { data: transactions } = await supabase
      .from('inventory_transactions')
      .select('id, created_at')

    const todayTransactions = (transactions || []).filter(
      (item) =>
        item.created_at &&
        new Date(item.created_at).toISOString().slice(0, 10) === today
    ).length

    setStats({
      pharmacies: pharmacies?.length || 0,
      inventoryItems: inventory?.length || 0,
      totalQuantity,
      totalValue,
      lowStock,
      todayTransactions,
    })

    setLoading(false)
  }

  return (
    <div style={{ padding: '24px', color: 'white' }}>
      <h1>Dashboard</h1>

      {loading && <div>Loading dashboard...</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
          marginTop: '24px',
        }}
      >
        <div style={cardStyle}>
          <div>Total Pharmacies</div>
          <h2>{stats.pharmacies}</h2>
        </div>

        <div style={cardStyle}>
          <div>Total Inventory Items</div>
          <h2>{stats.inventoryItems}</h2>
        </div>

        <div style={cardStyle}>
          <div>Total Quantity</div>
          <h2>{stats.totalQuantity}</h2>
        </div>

        <div style={cardStyle}>
          <div>Total Inventory Value</div>
          <h2>AED {stats.totalValue.toFixed(2)}</h2>
        </div>

        <div style={cardStyle}>
          <div>Low Stock Items</div>
          <h2>{stats.lowStock}</h2>
        </div>

        <div style={cardStyle}>
          <div>Today's Transactions</div>
          <h2>{stats.todayTransactions}</h2>
        </div>
      </div>
    </div>
  )
}

const cardStyle = {
  background: '#0f172a',
  padding: '24px',
  borderRadius: '16px',
  border: '1px solid #334155',
  color: 'white',
}