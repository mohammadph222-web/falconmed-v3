/**
 * FalconMed v3 — Shared Inventory Analytics Engine
 * src/analytics/inventoryAnalytics.js
 *
 * Pure utility module — no React, no UI, no Supabase queries.
 * Accepts pre-loaded datasets and returns computed analytics results.
 * All functions are pure and independently testable.
 *
 * Consumer pages:
 *   NearExpiryAnalyticsPage   → computeNearExpiryRisk, computeRedistribution
 *   FinancialAnalyticsPage    → computeABC, computeFinancialRisk
 *   AvailabilityAnalyticsPage → computeAvailability
 *   SupplyChainAnalyticsPage  → computeRedistribution
 *   InventoryEfficiencyPage   → computeOverstock, computeDeadStock, computeEfficiencyScores
 *   All pages                 → computeFinancialRisk (shared risk index)
 *
 * Data contracts (what each function expects):
 *
 *   inventory[]  — rows from the inventory table:
 *     { id, pharmacy_id, drug_code, quantity_on_hand, minimum_stock,
 *       maximum_stock, unit_cost, expiry_date, received_date,
 *       inventory_status, storage_location, batch_number }
 *
 *   pharmacies[] — rows from the pharmacies table:
 *     { id, name, code, pharmacy_type }
 *
 *   drugMaster[] — rows from drug_master_reference:
 *     { drug_code, doh_code, generic_name, brand_name, strength,
 *       dosage_form, therapeutic_class, atc_code }
 *
 * Version: 1.0 — Phase 1 Foundation
 * Last updated: June 2026
 */

// ─── Shared date utilities ────────────────────────────────────────────────────

/**
 * Returns today's date at midnight (00:00:00) for consistent comparisons.
 */
function today() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Parses a date string or Date object into a midnight-normalised Date.
 * Returns null for invalid or missing values.
 */
function parseDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Returns the number of days between two dates (positive = future).
 */
function daysBetween(dateA, dateB) {
  return Math.round((dateB - dateA) / (1000 * 60 * 60 * 24))
}

// ─── Shared value utilities ───────────────────────────────────────────────────

/** Safe number conversion — returns 0 for null, undefined, NaN. */
function num(value) {
  const n = Number(value)
  return isNaN(n) ? 0 : n
}

/**
 * Calculates line value: quantity_on_hand × unit_cost.
 * Returns 0 if either field is missing or zero.
 */
function lineValue(item) {
  return num(item.quantity_on_hand) * num(item.unit_cost)
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1 — computeABC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeABC
 *
 * Classifies every inventory item into ABC categories based on cumulative
 * value contribution across the entire network.
 *
 * Formula (standard Pareto / ABC analysis):
 *   1. Calculate line value for each item: qty × unit_cost
 *   2. Sort all items by line value descending
 *   3. Calculate cumulative value percentage
 *   4. Assign class:
 *      A = items whose cumulative value reaches 80% of total
 *      B = items whose cumulative value reaches 80–95% of total
 *      C = remaining items (95–100% of total value)
 *
 * Business value:
 *   Class A drugs require tightest stock control — highest financial risk.
 *   Class B drugs need regular monitoring.
 *   Class C drugs can tolerate looser control — minimal financial impact.
 *
 * @param {Array} inventory  — full inventory dataset
 * @param {Array} drugMaster — drug reference for names and classes
 * @returns {Array} items with added fields: abcClass, lineValue, cumulativePct
 *
 * Consumed by: FinancialAnalyticsPage, NearExpiryAnalyticsPage
 */
export function computeABC(inventory = [], drugMaster = []) {
  // Build drug lookup map for names and therapeutic class
  const drugMap = new Map(
    (drugMaster || []).map(d => [d.drug_code || d.doh_code, d])
  )

  // Calculate line value per item and filter zero-value records
  const items = (inventory || [])
    .map(item => {
      const drug  = drugMap.get(item.drug_code) || {}
      const value = lineValue(item)
      return {
        id:               item.id,
        pharmacy_id:      item.pharmacy_id,
        drug_code:        item.drug_code || '',
        generic_name:     (drug.generic_name  || '').trim(),
        brand_name:       (drug.brand_name    || '').trim(),
        strength:         (drug.strength      || '').trim(),
        dosage_form:      (drug.dosage_form   || '').trim(),
        therapeutic_class:(drug.therapeutic_class || 'Unclassified').trim(),
        quantity_on_hand: num(item.quantity_on_hand),
        unit_cost:        num(item.unit_cost),
        lineValue:        value,
        inventory_status: item.inventory_status || '',
      }
    })
    .filter(item => item.lineValue > 0)

  // Sort descending by line value
  items.sort((a, b) => b.lineValue - a.lineValue)

  const totalValue = items.reduce((sum, i) => sum + i.lineValue, 0)
  if (totalValue === 0) return []

  let cumulative = 0

  return items.map(item => {
    cumulative += item.lineValue
    const cumulativePct = (cumulative / totalValue) * 100

    let abcClass
    if (cumulativePct <= 80)  abcClass = 'A'
    else if (cumulativePct <= 95) abcClass = 'B'
    else                          abcClass = 'C'

    return {
      ...item,
      abcClass,
      cumulativePct: Math.round(cumulativePct * 100) / 100,
      valuePct: Math.round((item.lineValue / totalValue) * 10000) / 100,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2 — computeNearExpiryRisk
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeNearExpiryRisk
 *
 * Identifies all inventory items at risk of expiry and quantifies
 * their financial exposure by scenario bucket and therapeutic class.
 *
 * Scenario buckets:
 *   EXPIRED      expiry_date < today
 *   CRITICAL     expiry_date between today and today + 29 days
 *   NEAR_EXPIRY  expiry_date between today + 30 and today + 90 days
 *   HEALTHY      expiry_date > today + 90 days
 *
 * Formula:
 *   value_at_risk = quantity_on_hand × unit_cost for all non-HEALTHY items
 *   days_remaining = expiry_date − today (negative for expired)
 *
 * @param {Array} inventory  — full inventory dataset
 * @param {Array} pharmacies — pharmacy reference for names
 * @param {Array} drugMaster — drug reference for names and classes
 * @returns {Object} {
 *   items[],          — every at-risk item with risk metadata
 *   summary,          — network totals by bucket
 *   byPharmacy[],     — risk aggregated per pharmacy
 *   byClass[],        — risk aggregated per therapeutic class
 * }
 *
 * Consumed by: NearExpiryAnalyticsPage, ExecutiveDashboard (via existing logic)
 */
export function computeNearExpiryRisk(
  inventory  = [],
  pharmacies = [],
  drugMaster = []
) {
  const NOW         = today()
  const criticalEnd = new Date(NOW); criticalEnd.setDate(NOW.getDate() + 29)
  const nearEnd     = new Date(NOW); nearEnd.setDate(NOW.getDate() + 90)

  const pharmacyMap = new Map((pharmacies || []).map(p => [p.id, p]))
  const drugMap     = new Map((drugMaster  || []).map(d => [d.drug_code || d.doh_code, d]))

  // Summary accumulators
  const summary = {
    expiredCount: 0,      expiredValue: 0,
    criticalCount: 0,     criticalValue: 0,
    nearExpiryCount: 0,   nearExpiryValue: 0,
    healthyCount: 0,      healthyValue: 0,
    totalAtRiskValue: 0,
  }

  // Per-pharmacy accumulators
  const pharmacyMap2 = new Map()
  // Per-class accumulators
  const classMap = new Map()

  const items = []

  for (const item of (inventory || [])) {
    const expDate = parseDate(item.expiry_date)
    const drug    = drugMap.get(item.drug_code) || {}
    const pharmacy = pharmacyMap.get(item.pharmacy_id) || {}
    const value   = lineValue(item)
    const daysRemaining = expDate ? daysBetween(NOW, expDate) : null

    // Determine scenario bucket
    let bucket
    if (!expDate)               bucket = 'UNKNOWN'
    else if (expDate < NOW)     bucket = 'EXPIRED'
    else if (expDate <= criticalEnd) bucket = 'CRITICAL'
    else if (expDate <= nearEnd)     bucket = 'NEAR_EXPIRY'
    else                             bucket = 'HEALTHY'

    const tClass = (drug.therapeutic_class || 'Unclassified').trim()

    // Update summary
    if (bucket === 'EXPIRED')     { summary.expiredCount++;    summary.expiredValue    += value }
    if (bucket === 'CRITICAL')    { summary.criticalCount++;   summary.criticalValue   += value }
    if (bucket === 'NEAR_EXPIRY') { summary.nearExpiryCount++; summary.nearExpiryValue += value }
    if (bucket === 'HEALTHY')     { summary.healthyCount++;    summary.healthyValue    += value }
    if (bucket !== 'HEALTHY' && bucket !== 'UNKNOWN') summary.totalAtRiskValue += value

    // Update per-pharmacy
    const pid = item.pharmacy_id
    if (!pharmacyMap2.has(pid)) {
      pharmacyMap2.set(pid, {
        pharmacyId:   pid,
        pharmacyName: pharmacy.name || pid,
        pharmacyCode: pharmacy.code || '',
        expired: 0, expiredValue: 0,
        critical: 0, criticalValue: 0,
        nearExpiry: 0, nearExpiryValue: 0,
        totalAtRiskValue: 0,
      })
    }
    const pRow = pharmacyMap2.get(pid)
    if (bucket === 'EXPIRED')     { pRow.expired++;    pRow.expiredValue    += value }
    if (bucket === 'CRITICAL')    { pRow.critical++;   pRow.criticalValue   += value }
    if (bucket === 'NEAR_EXPIRY') { pRow.nearExpiry++; pRow.nearExpiryValue += value }
    if (bucket !== 'HEALTHY' && bucket !== 'UNKNOWN') pRow.totalAtRiskValue += value

    // Update per-class
    if (!classMap.has(tClass)) {
      classMap.set(tClass, {
        therapeuticClass: tClass,
        atRiskCount: 0, atRiskValue: 0,
        expiredValue: 0, criticalValue: 0, nearExpiryValue: 0,
      })
    }
    const cRow = classMap.get(tClass)
    if (bucket !== 'HEALTHY' && bucket !== 'UNKNOWN') {
      cRow.atRiskCount++
      cRow.atRiskValue += value
      if (bucket === 'EXPIRED')     cRow.expiredValue    += value
      if (bucket === 'CRITICAL')    cRow.criticalValue   += value
      if (bucket === 'NEAR_EXPIRY') cRow.nearExpiryValue += value
    }

    // Only include at-risk items in the items array
    if (bucket !== 'HEALTHY' && bucket !== 'UNKNOWN') {
      items.push({
        id:               item.id,
        pharmacy_id:      item.pharmacy_id,
        pharmacyName:     pharmacy.name || '',
        pharmacyCode:     pharmacy.code || '',
        drug_code:        item.drug_code || '',
        generic_name:     (drug.generic_name  || '').trim(),
        brand_name:       (drug.brand_name    || '').trim(),
        strength:         (drug.strength      || '').trim(),
        dosage_form:      (drug.dosage_form   || '').trim(),
        therapeutic_class: tClass,
        quantity_on_hand: num(item.quantity_on_hand),
        unit_cost:        num(item.unit_cost),
        lineValue:        value,
        expiry_date:      item.expiry_date || '',
        daysRemaining:    daysRemaining,
        bucket,
        batch_number:     item.batch_number || '',
        storage_location: item.storage_location || '',
      })
    }
  }

  // Sort items: expired first, then by days remaining ascending
  items.sort((a, b) => {
    const bucketOrder = { EXPIRED: 0, CRITICAL: 1, NEAR_EXPIRY: 2 }
    const oa = bucketOrder[a.bucket] ?? 3
    const ob = bucketOrder[b.bucket] ?? 3
    if (oa !== ob) return oa - ob
    return (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999)
  })

  return {
    items,
    summary,
    byPharmacy: [...pharmacyMap2.values()].sort((a, b) => b.totalAtRiskValue - a.totalAtRiskValue),
    byClass:    [...classMap.values()].sort((a, b) => b.atRiskValue - a.atRiskValue),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3 — computeRedistribution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeRedistribution
 *
 * Identifies cross-pharmacy redistribution opportunities:
 * drugs that are near-expiry (or overstocked) in one pharmacy
 * while being low-stock or out-of-stock in another.
 *
 * Formula:
 *   For each drug_code:
 *     source pharmacies = WHERE expiry_date ≤ 90 days AND quantity > 0
 *     destination pharmacies = WHERE quantity = 0 OR quantity < minimum_stock
 *     opportunity = MIN(source quantity, destination deficit)
 *     value_recoverable = opportunity × unit_cost
 *
 * @param {Array} inventory  — full inventory dataset
 * @param {Array} pharmacies — pharmacy reference
 * @returns {Array} opportunities[] each containing:
 *   { drug_code, sourcePharmacy, destinationPharmacy,
 *     transferQuantity, valueRecoverable, daysRemaining }
 *
 * Consumed by: NearExpiryAnalyticsPage, SupplyChainAnalyticsPage
 */
export function computeRedistribution(inventory = [], pharmacies = []) {
  const NOW     = today()
  const nearEnd = new Date(NOW); nearEnd.setDate(NOW.getDate() + 90)

  const pharmacyMap = new Map((pharmacies || []).map(p => [p.id, p]))

  // Group by drug_code
  const byDrug = new Map()

  for (const item of (inventory || [])) {
    const code = item.drug_code
    if (!code) continue

    if (!byDrug.has(code)) byDrug.set(code, { sources: [], destinations: [] })
    const group = byDrug.get(code)

    const qty     = num(item.quantity_on_hand)
    const expDate = parseDate(item.expiry_date)
    const daysRem = expDate ? daysBetween(NOW, expDate) : null

    // Source: has stock AND expiring within 90 days
    const isSource = qty > 0 && expDate && expDate <= nearEnd && expDate >= NOW
    // Destination: out of stock OR below minimum
    const minStock = num(item.minimum_stock)
    const isDest   = qty === 0 || (minStock > 0 && qty < minStock)

    if (isSource) {
      group.sources.push({
        pharmacyId:   item.pharmacy_id,
        pharmacyName: pharmacyMap.get(item.pharmacy_id)?.name || '',
        pharmacyCode: pharmacyMap.get(item.pharmacy_id)?.code || '',
        quantity:     qty,
        unit_cost:    num(item.unit_cost),
        daysRemaining: daysRem,
        expiry_date:  item.expiry_date || '',
      })
    }

    if (isDest && qty >= 0) {
      const deficit = minStock > 0 ? minStock - qty : 1
      group.destinations.push({
        pharmacyId:   item.pharmacy_id,
        pharmacyName: pharmacyMap.get(item.pharmacy_id)?.name || '',
        pharmacyCode: pharmacyMap.get(item.pharmacy_id)?.code || '',
        currentQty:   qty,
        minimumStock: minStock,
        deficit:      Math.max(1, deficit),
        unit_cost:    num(item.unit_cost),
      })
    }
  }

  // Build opportunity pairs
  const opportunities = []

  for (const [drugCode, group] of byDrug.entries()) {
    if (group.sources.length === 0 || group.destinations.length === 0) continue

    for (const src of group.sources) {
      for (const dst of group.destinations) {
        // Skip same pharmacy
        if (src.pharmacyId === dst.pharmacyId) continue

        const transferQty      = Math.min(src.quantity, dst.deficit)
        const unitCost         = src.unit_cost || dst.unit_cost
        const valueRecoverable = transferQty * unitCost

        if (transferQty <= 0) continue

        opportunities.push({
          drug_code:        drugCode,
          sourcePharmacyId:   src.pharmacyId,
          sourcePharmacy:     src.pharmacyName,
          sourcePharmacyCode: src.pharmacyCode,
          sourceQuantity:     src.quantity,
          daysRemaining:      src.daysRemaining,
          expiry_date:        src.expiry_date,
          destinationPharmacyId:   dst.pharmacyId,
          destinationPharmacy:     dst.pharmacyName,
          destinationPharmacyCode: dst.pharmacyCode,
          currentQtyAtDest:   dst.currentQty,
          deficitAtDest:      dst.deficit,
          transferQuantity:   transferQty,
          unit_cost:          unitCost,
          valueRecoverable:   Math.round(valueRecoverable * 100) / 100,
        })
      }
    }
  }

  // Sort by value recoverable descending
  return opportunities.sort((a, b) => b.valueRecoverable - a.valueRecoverable)
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 4 — computeAvailability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeAvailability
 *
 * Calculates formulary availability rates per pharmacy and network-wide.
 *
 * Formula:
 *   availabilityRate = (activeItems / totalItems) × 100
 *   where activeItems = quantity_on_hand > 0 AND not expired
 *
 *   outOfStockRate = (outOfStockItems / totalItems) × 100
 *   criticalDrugAvailability = active critical drugs / total critical drugs × 100
 *
 * @param {Array} inventory  — full inventory dataset
 * @param {Array} pharmacies — pharmacy reference
 * @returns {Object} {
 *   byPharmacy[],      — availability metrics per pharmacy
 *   network,           — network-wide summary
 *   outOfStockItems[], — all items with quantity = 0
 * }
 *
 * Consumed by: AvailabilityAnalyticsPage
 */
export function computeAvailability(inventory = [], pharmacies = []) {
  const NOW         = today()
  const pharmacyMap = new Map((pharmacies || []).map(p => [p.id, p]))

  // Per-pharmacy accumulators
  const pharmAccum = new Map()

  for (const item of (inventory || [])) {
    const pid = item.pharmacy_id
    if (!pharmAccum.has(pid)) {
      const p = pharmacyMap.get(pid) || {}
      pharmAccum.set(pid, {
        pharmacyId:   pid,
        pharmacyName: p.name || '',
        pharmacyCode: p.code || '',
        pharmacyType: p.pharmacy_type || '',
        total: 0, active: 0, outOfStock: 0,
        expired: 0, lowStock: 0,
      })
    }

    const row     = pharmAccum.get(pid)
    const qty     = num(item.quantity_on_hand)
    const minStock= num(item.minimum_stock)
    const expDate = parseDate(item.expiry_date)
    const isExpired = expDate && expDate < NOW

    row.total++

    if (qty === 0)                                    row.outOfStock++
    else if (isExpired)                               row.expired++
    else if (minStock > 0 && qty <= minStock)         row.lowStock++
    else                                              row.active++
  }

  // Build per-pharmacy results
  const byPharmacy = [...pharmAccum.values()].map(row => ({
    ...row,
    availabilityRate: row.total > 0
      ? Math.round((row.active / row.total) * 1000) / 10
      : 0,
    outOfStockRate: row.total > 0
      ? Math.round((row.outOfStock / row.total) * 1000) / 10
      : 0,
    unavailableCount: row.outOfStock + row.expired,
  })).sort((a, b) => a.availabilityRate - b.availabilityRate)

  // Network totals
  const network = byPharmacy.reduce((acc, p) => {
    acc.total      += p.total
    acc.active     += p.active
    acc.outOfStock += p.outOfStock
    acc.expired    += p.expired
    acc.lowStock   += p.lowStock
    return acc
  }, { total: 0, active: 0, outOfStock: 0, expired: 0, lowStock: 0 })

  network.availabilityRate = network.total > 0
    ? Math.round((network.active / network.total) * 1000) / 10
    : 0

  // Out of stock item list
  const outOfStockItems = (inventory || [])
    .filter(item => num(item.quantity_on_hand) === 0)
    .map(item => ({
      pharmacy_id:      item.pharmacy_id,
      pharmacyName:     pharmacyMap.get(item.pharmacy_id)?.name || '',
      drug_code:        item.drug_code || '',
      minimum_stock:    num(item.minimum_stock),
      inventory_status: item.inventory_status || '',
    }))

  return { byPharmacy, network, outOfStockItems }
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 5 — computeOverstock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeOverstock
 *
 * Identifies items where quantity_on_hand exceeds maximum_stock.
 * Quantifies the excess in units and AED value.
 *
 * Formula:
 *   isOverstocked = quantity_on_hand > maximum_stock AND maximum_stock > 0
 *   excessQuantity = quantity_on_hand - maximum_stock
 *   excessValue = excessQuantity × unit_cost
 *
 * Business value:
 *   Overstock ties up capital and increases expiry risk.
 *   High-value overstock items are the highest-priority targets for
 *   procurement freeze or inter-pharmacy redistribution.
 *
 * @param {Array} inventory  — full inventory dataset
 * @param {Array} pharmacies — pharmacy reference
 * @returns {Object} {
 *   items[],       — each overstocked item with excess quantity and value
 *   byPharmacy[],  — overstock summary per pharmacy
 *   totalExcessValue — network-wide excess value in AED
 * }
 *
 * Consumed by: InventoryEfficiencyPage, SupplyChainAnalyticsPage
 */
export function computeOverstock(inventory = [], pharmacies = []) {
  const pharmacyMap = new Map((pharmacies || []).map(p => [p.id, p]))

  const items = []
  const pharmMap = new Map()

  for (const item of (inventory || [])) {
    const qty    = num(item.quantity_on_hand)
    const maxStk = num(item.maximum_stock)

    // Only flag if maximum is defined and quantity exceeds it
    if (maxStk <= 0 || qty <= maxStk) continue

    const excessQty   = qty - maxStk
    const excessValue = excessQty * num(item.unit_cost)
    const pharmacy    = pharmacyMap.get(item.pharmacy_id) || {}

    items.push({
      id:               item.id,
      pharmacy_id:      item.pharmacy_id,
      pharmacyName:     pharmacy.name || '',
      pharmacyCode:     pharmacy.code || '',
      drug_code:        item.drug_code || '',
      quantity_on_hand: qty,
      maximum_stock:    maxStk,
      minimum_stock:    num(item.minimum_stock),
      unit_cost:        num(item.unit_cost),
      totalValue:       lineValue(item),
      excessQuantity:   excessQty,
      excessValue:      Math.round(excessValue * 100) / 100,
      expiry_date:      item.expiry_date || '',
    })

    // Accumulate per pharmacy
    const pid = item.pharmacy_id
    if (!pharmMap.has(pid)) {
      pharmMap.set(pid, {
        pharmacyId:   pid,
        pharmacyName: pharmacy.name || '',
        pharmacyCode: pharmacy.code || '',
        overstockCount: 0,
        excessValue: 0,
      })
    }
    const pRow = pharmMap.get(pid)
    pRow.overstockCount++
    pRow.excessValue += excessValue
  }

  const totalExcessValue = items.reduce((s, i) => s + i.excessValue, 0)

  return {
    items: items.sort((a, b) => b.excessValue - a.excessValue),
    byPharmacy: [...pharmMap.values()].sort((a, b) => b.excessValue - a.excessValue),
    totalExcessValue: Math.round(totalExcessValue * 100) / 100,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 6 — computeDeadStock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeDeadStock
 *
 * Identifies stock that shows no consumption signal within a defined window.
 * Without transaction history, uses received_date as a proxy:
 * if a drug was received more than `thresholdDays` ago and still has stock,
 * it is classified as potentially dead stock.
 *
 * Formula:
 *   isDead = received_date < (today - thresholdDays)
 *            AND quantity_on_hand > 0
 *            AND inventory_status = 'ACTIVE'
 *
 * Note: This is an approximation. Accurate dead stock analysis requires
 * per-drug dispense history. When consumption data becomes available,
 * replace the received_date proxy with last_dispense_date logic.
 *
 * @param {Array}  inventory      — full inventory dataset
 * @param {Array}  pharmacies     — pharmacy reference
 * @param {number} thresholdDays  — days without movement signal (default: 180)
 * @returns {Object} {
 *   items[],          — dead stock candidates with value
 *   byPharmacy[],     — summary per pharmacy
 *   totalDeadValue    — network total in AED
 * }
 *
 * Consumed by: InventoryEfficiencyPage, FinancialAnalyticsPage
 */
export function computeDeadStock(
  inventory     = [],
  pharmacies    = [],
  thresholdDays = 180
) {
  const NOW         = today()
  const cutoffDate  = new Date(NOW)
  cutoffDate.setDate(NOW.getDate() - thresholdDays)

  const pharmacyMap = new Map((pharmacies || []).map(p => [p.id, p]))

  const items    = []
  const pharmMap = new Map()

  for (const item of (inventory || [])) {
    const qty        = num(item.quantity_on_hand)
    const receivedDt = parseDate(item.received_date)

    // Only flag ACTIVE items with stock received beyond the threshold
    if (qty <= 0) continue
    if (item.inventory_status === 'EXPIRED') continue
    if (!receivedDt || receivedDt >= cutoffDate) continue

    const daysHeld  = daysBetween(receivedDt, NOW)
    const value     = lineValue(item)
    const pharmacy  = pharmacyMap.get(item.pharmacy_id) || {}

    items.push({
      id:               item.id,
      pharmacy_id:      item.pharmacy_id,
      pharmacyName:     pharmacy.name || '',
      pharmacyCode:     pharmacy.code || '',
      drug_code:        item.drug_code || '',
      quantity_on_hand: qty,
      unit_cost:        num(item.unit_cost),
      lineValue:        value,
      received_date:    item.received_date || '',
      expiry_date:      item.expiry_date || '',
      daysHeld,
      // Flag urgency: held > 270 days is high priority
      urgency: daysHeld > 270 ? 'HIGH' : 'MEDIUM',
    })

    const pid = item.pharmacy_id
    if (!pharmMap.has(pid)) {
      pharmMap.set(pid, {
        pharmacyId:    pid,
        pharmacyName:  pharmacy.name || '',
        pharmacyCode:  pharmacy.code || '',
        deadStockCount: 0,
        deadStockValue: 0,
      })
    }
    const pRow = pharmMap.get(pid)
    pRow.deadStockCount++
    pRow.deadStockValue += value
  }

  const totalDeadValue = items.reduce((s, i) => s + i.lineValue, 0)

  return {
    items: items.sort((a, b) => b.lineValue - a.lineValue),
    byPharmacy: [...pharmMap.values()].sort((a, b) => b.deadStockValue - a.deadStockValue),
    totalDeadValue: Math.round(totalDeadValue * 100) / 100,
    thresholdDays,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 7 — computeEfficiencyScores
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeEfficiencyScores
 *
 * Produces a composite inventory efficiency score per pharmacy (0–100).
 *
 * Score components and weights:
 *   Availability rate      30%  — formulary items with stock > 0
 *   Min/Max compliance     25%  — items within reorder boundaries
 *   No expired stock       20%  — proportion of non-expired active records
 *   No overstock           15%  — items below maximum stock
 *   Near-expiry exposure   10%  — inverse of near-expiry as % of total value
 *
 * Each component scores 0–100, weighted sum = efficiency score.
 *
 * @param {Array} inventory  — full inventory dataset
 * @param {Array} pharmacies — pharmacy reference
 * @returns {Array} pharmacies with efficiencyScore and component breakdown
 *
 * Consumed by: InventoryEfficiencyPage, ExecutivePerformancePage (future)
 */
export function computeEfficiencyScores(inventory = [], pharmacies = []) {
  const NOW         = today()
  const nearEnd     = new Date(NOW); nearEnd.setDate(NOW.getDate() + 90)
  const pharmacyMap = new Map((pharmacies || []).map(p => [p.id, p]))

  const pharmAccum = new Map()

  for (const item of (inventory || [])) {
    const pid  = item.pharmacy_id
    const p    = pharmacyMap.get(pid) || {}

    if (!pharmAccum.has(pid)) {
      pharmAccum.set(pid, {
        pharmacyId:   pid,
        pharmacyName: p.name || '',
        pharmacyCode: p.code || '',
        pharmacyType: p.pharmacy_type || '',
        total: 0,
        available: 0,        // qty > 0 and not expired
        withinMinMax: 0,     // min ≤ qty ≤ max
        notExpired: 0,       // not expired
        notOverstocked: 0,   // qty ≤ max
        totalValue: 0,
        nearExpiryValue: 0,
      })
    }

    const row    = pharmAccum.get(pid)
    const qty    = num(item.quantity_on_hand)
    const minStk = num(item.minimum_stock)
    const maxStk = num(item.maximum_stock)
    const expDt  = parseDate(item.expiry_date)
    const val    = lineValue(item)

    row.total++
    row.totalValue += val

    const isExpired = expDt && expDt < NOW
    const isNearExp = expDt && expDt >= NOW && expDt <= nearEnd

    if (qty > 0 && !isExpired) row.available++
    if (!isExpired)            row.notExpired++
    if (maxStk <= 0 || qty <= maxStk) row.notOverstocked++
    if (minStk > 0 && qty >= minStk && (maxStk <= 0 || qty <= maxStk)) row.withinMinMax++
    if (isNearExp) row.nearExpiryValue += val
  }

  return [...pharmAccum.values()].map(row => {
    const t = row.total || 1

    // Component scores (0-100)
    const availabilityScore  = Math.round((row.available       / t) * 100)
    const minMaxScore        = Math.round((row.withinMinMax    / t) * 100)
    const expiryScore        = Math.round((row.notExpired      / t) * 100)
    const overstockScore     = Math.round((row.notOverstocked  / t) * 100)
    const nearExpiryPct      = row.totalValue > 0
      ? (row.nearExpiryValue / row.totalValue) * 100
      : 0
    // Near-expiry score: 100 = no near-expiry exposure, 0 = all near-expiry
    const nearExpiryScore    = Math.round(Math.max(0, 100 - nearExpiryPct * 2))

    // Weighted composite (weights sum to 100)
    const efficiencyScore = Math.round(
      availabilityScore  * 0.30 +
      minMaxScore        * 0.25 +
      expiryScore        * 0.20 +
      overstockScore     * 0.15 +
      nearExpiryScore    * 0.10
    )

    let efficiencyLabel, efficiencyTone
    if (efficiencyScore >= 85)      { efficiencyLabel = 'Efficient';    efficiencyTone = 'green'  }
    else if (efficiencyScore >= 70) { efficiencyLabel = 'Acceptable';   efficiencyTone = 'amber'  }
    else                            { efficiencyLabel = 'Needs Review'; efficiencyTone = 'red'    }

    return {
      ...row,
      efficiencyScore,
      efficiencyLabel,
      efficiencyTone,
      components: {
        availabilityScore,
        minMaxScore,
        expiryScore,
        overstockScore,
        nearExpiryScore,
      },
    }
  }).sort((a, b) => a.efficiencyScore - b.efficiencyScore)
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 8 — computeFinancialRisk
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeFinancialRisk
 *
 * Computes a comprehensive financial risk profile for the network.
 * Provides a single Financial Risk Index (FRI) and component breakdown.
 *
 * Financial Risk Index (FRI):
 *   FRI = (expiredValue + criticalValue + nearExpiryValue) / totalValue × 100
 *
 * Carrying Cost Estimate:
 *   Based on pharmaceutical industry standard: 25-30% of inventory value
 *   per year represents holding costs (storage, handling, insurance, capital).
 *   carryingCostMonthly = totalValue × 0.27 / 12
 *
 * Value Recovery Potential:
 *   The proportion of at-risk value that could theoretically be recovered
 *   through redistribution, accelerated dispensing, or return to supplier.
 *   Conservative estimate: 60% of near-expiry and critical value is recoverable.
 *   Expired value = 0% recoverable (confirmed loss).
 *
 * @param {Array} inventory — full inventory dataset
 * @returns {Object} financial risk profile
 *
 * Consumed by: All analytical pages, Executive Dashboard summary panel
 */
export function computeFinancialRisk(inventory = []) {
  const NOW         = today()
  const criticalEnd = new Date(NOW); criticalEnd.setDate(NOW.getDate() + 29)
  const nearEnd     = new Date(NOW); nearEnd.setDate(NOW.getDate() + 90)

  let totalValue      = 0
  let expiredValue    = 0
  let criticalValue   = 0
  let nearExpiryValue = 0
  let overstockValue  = 0
  let outOfStockCount = 0

  for (const item of (inventory || [])) {
    const qty    = num(item.quantity_on_hand)
    const val    = lineValue(item)
    const maxStk = num(item.maximum_stock)
    const expDt  = parseDate(item.expiry_date)

    totalValue += val

    if (qty === 0) { outOfStockCount++; continue }

    if (expDt) {
      if (expDt < NOW)          expiredValue    += val
      else if (expDt <= criticalEnd) criticalValue   += val
      else if (expDt <= nearEnd)    nearExpiryValue += val
    }

    if (maxStk > 0 && qty > maxStk) {
      overstockValue += (qty - maxStk) * num(item.unit_cost)
    }
  }

  const totalAtRiskValue       = expiredValue + criticalValue + nearExpiryValue
  const financialRiskIndex     = totalValue > 0
    ? Math.round((totalAtRiskValue / totalValue) * 10000) / 100
    : 0

  // 60% of near-expiry + critical is estimated recoverable
  // 0% of expired is recoverable
  const valueRecoveryPotential = Math.round(
    ((criticalValue + nearExpiryValue) * 0.60) * 100
  ) / 100

  // Carrying cost at 27% annual rate / 12 months
  const carryingCostMonthly = Math.round((totalValue * 0.27 / 12) * 100) / 100

  // Preventable loss = what we can still save
  const preventableLoss = criticalValue + nearExpiryValue
  // Confirmed loss = already expired
  const confirmedLoss   = expiredValue

  return {
    totalValue:           Math.round(totalValue * 100) / 100,
    expiredValue:         Math.round(expiredValue * 100) / 100,
    criticalValue:        Math.round(criticalValue * 100) / 100,
    nearExpiryValue:      Math.round(nearExpiryValue * 100) / 100,
    overstockValue:       Math.round(overstockValue * 100) / 100,
    totalAtRiskValue:     Math.round(totalAtRiskValue * 100) / 100,
    preventableLoss:      Math.round(preventableLoss * 100) / 100,
    confirmedLoss:        Math.round(confirmedLoss * 100) / 100,
    financialRiskIndex,
    valueRecoveryPotential,
    carryingCostMonthly,
    outOfStockCount,
    // Risk tier
    riskTier: financialRiskIndex >= 10 ? 'HIGH'
             : financialRiskIndex >= 5  ? 'MEDIUM'
             :                            'LOW',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE EXPORT — computeAll
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeAll
 *
 * Runs all eight analytics functions in a single call.
 * Use this when a page needs multiple analytics results simultaneously
 * to avoid passing data through multiple separate calls.
 *
 * @param {Object} datasets — { inventory, pharmacies, drugMaster }
 * @returns {Object} all analytics results keyed by function name
 */
export function computeAll({ inventory = [], pharmacies = [], drugMaster = [] } = {}) {
  return {
    abc:            computeABC(inventory, drugMaster),
    nearExpiryRisk: computeNearExpiryRisk(inventory, pharmacies, drugMaster),
    redistribution: computeRedistribution(inventory, pharmacies),
    availability:   computeAvailability(inventory, pharmacies),
    overstock:      computeOverstock(inventory, pharmacies),
    deadStock:      computeDeadStock(inventory, pharmacies),
    efficiencyScores: computeEfficiencyScores(inventory, pharmacies),
    financialRisk:  computeFinancialRisk(inventory),
  }
}
