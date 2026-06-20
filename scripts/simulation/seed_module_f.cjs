/**
 * FalconMed Simulator v1 — Module F: Adjustment Simulation
 * File: scripts/simulation/seed_module_f.cjs
 *
 * PURPOSE:
 *   Generates 300–600 inventory adjustment events across 17 pharmacies.
 *   Net slightly negative — more write-offs than additions (realistic).
 *
 * ADJUSTMENT TYPES:
 *   ADJUSTMENT_OUT (75%):
 *     - DAMAGED           ~35% of all adjustments
 *     - EXPIRED_WRITEOFF  ~25% of all adjustments
 *     - WASTAGE           ~15% of all adjustments
 *   ADJUSTMENT_IN (25%):
 *     - RECEIVING_ERROR   ~20% of all adjustments
 *     - SYSTEM_CORRECTION ~5%  of all adjustments
 *
 * WRITES TO:
 *   1. inventory_transactions  (type = ADJUSTMENT_IN or ADJUSTMENT_OUT)
 *   2. inventory               (quantity_on_hand updated)
 *
 * RULES:
 *   - APPEND ONLY — no modification of existing simulation data
 *   - Non-negative guarantee — ADJUSTMENT_OUT never reduces qty below 0
 *   - SIM-F tag in notes for rollback identification
 *   - Idempotent — checks existing SIM-F count before inserting
 *   - Date range: within Module D simulation window (2026-03-19 → 2026-06-19)
 *   - EXPIRED_WRITEOFF targets rows where expiry_date < today (stranded expired stock)
 *   - DAMAGED targets healthy stock rows
 *
 * RUN:
 *   node scripts/simulation/seed_module_f.cjs --dry-run
 *   node scripts/simulation/seed_module_f.cjs
 *   node scripts/simulation/seed_module_f.cjs --rollback
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ─── Supabase Client ──────────────────────────────────────────────────────────

console.log('  DIAG SERVICE_ROLE_KEY exists :', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('  DIAG KEY prefix              :', process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 6));
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n  ERROR: Missing env vars.');
  console.error('  SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required in .env\n');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    },
  }
);

// ─── Configuration ────────────────────────────────────────────────────────────

const SIM_TAG      = 'SIM-F';
const TARGET_MIN   = 300;
const TARGET_MAX   = 600;
const BATCH_SIZE   = 100;
const DRY_RUN      = process.argv.includes('--dry-run');
const ROLLBACK_MODE = process.argv.includes('--rollback');

// Date range within Module D simulation window
const SIM_START = new Date('2026-03-19T00:00:00.000Z');
const SIM_END   = new Date('2026-06-19T23:59:59.000Z');

// Adjustment type distribution (weights must sum to 100)
const ADJUSTMENT_TYPES = [
  { type: 'ADJUSTMENT_MINUS', reason: 'DAMAGED',           weight: 35, label: 'Damaged goods write-off'      },
  { type: 'ADJUSTMENT_MINUS', reason: 'EXPIRED_WRITEOFF',  weight: 25, label: 'Expired stock write-off'      },
  { type: 'ADJUSTMENT_MINUS', reason: 'WASTAGE',           weight: 15, label: 'Wastage / spillage'           },
  { type: 'ADJUSTMENT_PLUS',  reason: 'RECEIVING_ERROR',   weight: 20, label: 'Receiving quantity correction' },
  { type: 'ADJUSTMENT_PLUS',  reason: 'SYSTEM_CORRECTION', weight:  5, label: 'System quantity correction'   },
];
const TOTAL_WEIGHT = ADJUSTMENT_TYPES.reduce((s, t) => s + t.weight, 0); // 100

// Adjustment qty ranges by type
const ADJ_OUT_QTY = { min: 1, max: 15 };
const ADJ_IN_QTY  = { min: 5, max: 30 };

// ─── Utilities ────────────────────────────────────────────────────────────────

const randInt   = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const printLine = (c = '-', n = 72) => console.log(c.repeat(n));

function randomTimestamp() {
  const span = SIM_END.getTime() - SIM_START.getTime();
  return new Date(SIM_START.getTime() + Math.random() * span).toISOString();
}

function pickAdjustmentType() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const t of ADJUSTMENT_TYPES) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return ADJUSTMENT_TYPES[0];
}

function progressBar(cur, tot, w = 28) {
  const f = Math.round((cur / (tot || 1)) * w);
  return `[${'█'.repeat(f)}${'░'.repeat(w - f)}] ${cur}/${tot}`;
}

// ─── Rollback ────────────────────────────────────────────────────────────────

async function rollback() {
  printLine('=');
  console.log('  ROLLBACK MODE — removing SIM-F adjustment records');
  printLine('=');

  const { count } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true })
    .like('notes', `${SIM_TAG}%`);

  console.log(`\n  SIM-F inventory_transactions : ${count || 0}`);
  if (!count) { console.log('\n  Nothing to rollback.\n'); process.exit(0); }

  console.log('\n  WARN: inventory.quantity_on_hand changes cannot be auto-reversed.');
  console.log('  Deleting transaction records only.\n');

  await new Promise(resolve => {
    process.stdout.write('  Type YES to confirm rollback: ');
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', d => {
      if (d.trim().toUpperCase() !== 'YES') { console.log('  Aborted.\n'); process.exit(0); }
      resolve();
    });
  });

  let deleted = 0;
  while (true) {
    const { data } = await supabase
      .from('inventory_transactions')
      .select('id')
      .like('notes', `${SIM_TAG}%`)
      .limit(500);
    if (!data?.length) break;
    await supabase.from('inventory_transactions')
      .delete().in('id', data.map(r => r.id));
    deleted += data.length;
    process.stdout.write(`\r  Deleted ${deleted} records...`);
  }

  console.log(`\n\n  Deleted ${deleted} SIM-F rows.`);
  printLine('=');
  console.log('  ROLLBACK COMPLETE\n');
  process.exit(0);
}

// ─── Phase 0: Load live data ──────────────────────────────────────────────────

async function loadPharmacies() {
  const { data, error } = await supabase.from('pharmacies').select('*');
  if (error) throw new Error(`pharmacies: ${error.message}`);

  const sample = data[0];
  let active;
  if ('status' in sample) {
    active = data.filter(p => String(p.status || '').toUpperCase() === 'ACTIVE');
  } else if ('is_active' in sample) {
    active = data.filter(p => p.is_active === true);
  } else {
    active = data;
  }
  console.log(`  OK  ${active.length} pharmacies loaded`);
  return active;
}

async function loadOrgId(pharmacies) {
  const id = pharmacies[0]?.organization_id;
  if (!id) throw new Error('organization_id missing.');
  return id;
}

async function loadInventoryForPharmacy(pharmacyId) {
  const { data, error } = await supabase
    .from('inventory')
    .select('id, drug_code, quantity_on_hand, expiry_date, unit_cost, batch_number')
    .eq('pharmacy_id', pharmacyId);
  if (error) throw new Error(`inventory ${pharmacyId}: ${error.message}`);
  return data || [];
}

async function countExistingSimF() {
  const { count, error } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true })
    .like('notes', `${SIM_TAG}%`);
  if (error) throw new Error(`SIM-F count: ${error.message}`);
  return count || 0;
}

// ─── Build Adjustments ───────────────────────────────────────────────────────

function buildAdjustmentsForPharmacy(pharm, invRows, targetCount, qtyTracker) {
  const today    = new Date().toISOString().split('T')[0];
  const events   = [];

  // Separate expired rows (for EXPIRED_WRITEOFF) from active rows
  const expiredRows = invRows.filter(r => r.expiry_date && r.expiry_date < today && r.quantity_on_hand > 0);
  const activeRows  = invRows.filter(r => r.quantity_on_hand > 0);

  if (activeRows.length === 0 && expiredRows.length === 0) return events;

  for (let i = 0; i < targetCount; i++) {
    const adjType = pickAdjustmentType();
    const ts      = randomTimestamp();

    let targetRow;
    let adjQty;

    if (adjType.reason === 'EXPIRED_WRITEOFF') {
      // Specifically target expired stock rows
      if (expiredRows.length === 0) continue;
      targetRow = expiredRows[Math.floor(Math.random() * expiredRows.length)];
      const currentQty = qtyTracker.get(targetRow.id) ?? targetRow.quantity_on_hand;
      if (currentQty <= 0) continue;
      // Write off all or part of expired stock
      adjQty = Math.min(currentQty, randInt(ADJ_OUT_QTY.min, ADJ_OUT_QTY.max));
    } else if (adjType.type === 'ADJUSTMENT_MINUS') {
      // Target active rows with enough stock to write off
      const eligible = activeRows.filter(r => (qtyTracker.get(r.id) ?? r.quantity_on_hand) > 5);
      if (eligible.length === 0) continue;
      targetRow = eligible[Math.floor(Math.random() * eligible.length)];
      const currentQty = qtyTracker.get(targetRow.id) ?? targetRow.quantity_on_hand;
      adjQty = Math.min(
        randInt(ADJ_OUT_QTY.min, ADJ_OUT_QTY.max),
        Math.floor(currentQty * 0.2)  // never adjust out more than 20% of stock
      );
      if (adjQty < 1) continue;
    } else {
      // ADJUSTMENT_IN — target any row (receiving correction or system fix)
      if (activeRows.length === 0) continue;
      targetRow = activeRows[Math.floor(Math.random() * activeRows.length)];
      adjQty    = randInt(ADJ_IN_QTY.min, ADJ_IN_QTY.max);
    }

    // Update in-memory tracker
    const currentQty = qtyTracker.get(targetRow.id) ?? targetRow.quantity_on_hand;
    const newQty = adjType.type === 'ADJUSTMENT_MINUS'
      ? Math.max(0, currentQty - adjQty)
      : currentQty + adjQty;
    qtyTracker.set(targetRow.id, newQty);

    events.push({
      pharmacyId:   pharm.id,
      inventoryId:  targetRow.id,
      drugCode:     targetRow.drug_code,
      adjType:      adjType.type,
      reason:       adjType.reason,
      label:        adjType.label,
      adjQty,
      timestamp:    ts,
      unitCost:     parseFloat(targetRow.unit_cost) || 0,
    });
  }

  return events;
}

// ─── Insert ──────────────────────────────────────────────────────────────────

async function insertAdjustments(allEvents, orgId) {
  const txnRows = allEvents.map(e => ({
    organization_id:         orgId,
    source_pharmacy_id:      e.adjType === 'ADJUSTMENT_MINUS' ? e.pharmacyId : null,
    destination_pharmacy_id: e.adjType === 'ADJUSTMENT_PLUS'  ? e.pharmacyId : null,
    drug_code:               e.drugCode,
    quantity:                e.adjQty,
    transaction_type:        e.adjType,
    notes:                   `${SIM_TAG}|${e.reason}|${e.label}`,
    created_at:              e.timestamp,
  }));

  if (DRY_RUN) {
    console.log(`  DRY RUN: would insert ${txnRows.length} adjustment transaction rows`);
    return txnRows.length;
  }

  let inserted = 0;
  for (let i = 0; i < txnRows.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from('inventory_transactions')
      .insert(txnRows.slice(i, i + BATCH_SIZE));
    if (error) throw new Error(`inventory_transactions: ${error.message}`);
    inserted += Math.min(BATCH_SIZE, txnRows.length - i);
    process.stdout.write(`\r  Inserting transactions: ${progressBar(inserted, txnRows.length)}`);
  }
  console.log('\n');
  return inserted;
}

async function flushInventoryUpdates(allEvents, qtyTracker) {
  // Build net update map per inventory row
  const updateMap = new Map();
  for (const e of allEvents) {
    updateMap.set(e.inventoryId, qtyTracker.get(e.inventoryId) ?? 0);
  }

  if (DRY_RUN) {
    console.log(`  DRY RUN: would update ${updateMap.size} inventory rows`);
    return updateMap.size;
  }

  const now     = new Date().toISOString();
  const entries = [...updateMap.entries()];
  let updated   = 0;

  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    await Promise.all(batch.map(([id, newQty]) =>
      supabase.from('inventory').update({
        quantity_on_hand: Math.max(0, newQty),
        last_updated:     now,
        updated_at:       now,
      }).eq('id', id)
    ));
    updated += batch.length;
    process.stdout.write(`\r  Updating inventory: ${progressBar(updated, entries.length)}`);
  }
  console.log('\n');
  return updated;
}

// ─── Manifest ────────────────────────────────────────────────────────────────

function printManifest(allEvents, existingSimF) {
  // Count by type and reason
  const byReason = {};
  let outCount = 0, inCount = 0;
  for (const e of allEvents) {
    byReason[e.reason] = (byReason[e.reason] || 0) + 1;
    if (e.adjType === 'ADJUSTMENT_MINUS') outCount++;
    else inCount++;
  }

  const totalQtyOut = allEvents.filter(e => e.adjType === 'ADJUSTMENT_MINUS').reduce((s,e)=>s+e.adjQty,0);
  const totalQtyIn  = allEvents.filter(e => e.adjType === 'ADJUSTMENT_PLUS').reduce((s,e)=>s+e.adjQty,0);
  const netQty      = totalQtyIn - totalQtyOut;

  printLine('=');
  console.log('  FALCONMED SIMULATOR v1 - MODULE F: ADJUSTMENT SIMULATION');
  printLine('=');
  console.log(`\n  Mode                 : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE INSERT'}`);
  console.log(`  Existing SIM-F txns  : ${existingSimF}`);
  console.log(`  Total adjustments    : ${allEvents.length}`);
  console.log(`  ADJUSTMENT_MINUS     : ${outCount} events (${Math.round(outCount/allEvents.length*100)}%)`);
  console.log(`  ADJUSTMENT_PLUS      : ${inCount} events (${Math.round(inCount/allEvents.length*100)}%)`);
  console.log(`  Net qty change       : ${netQty >= 0 ? '+' : ''}${netQty} units (negative = net write-off)`);

  console.log('\n  REASON CODE BREAKDOWN');
  printLine();
  ADJUSTMENT_TYPES.forEach(t => {
    const n = byReason[t.reason] || 0;
    console.log(`  ${t.reason.padEnd(22)} ${String(n).padStart(4)} events  (${t.label})`);
  });

  console.log('\n  TABLES TO BE WRITTEN');
  printLine();
  console.log(`  inventory_transactions : +${allEvents.length} rows`);
  console.log(`  inventory              : quantity_on_hand updated for touched rows`);
  printLine('=');
}

// ─── Confirm ────────────────────────────────────────────────────────────────

async function confirmProceed(count) {
  if (DRY_RUN) { console.log('\n  DRY RUN — no data will be written.\n'); return true; }
  return new Promise(resolve => {
    process.stdout.write(`\n  Insert ${count} adjustment events? Type YES: `);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', d => resolve(d.trim().toUpperCase() === 'YES'));
  });
}

// ─── Validation Report ───────────────────────────────────────────────────────

async function validationReport(txnInserted, invUpdated, allEvents) {
  printLine('=');
  console.log('  MODULE F — VALIDATION REPORT');
  printLine('=');

  const { count: simFCount } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true })
    .like('notes', `${SIM_TAG}%`);

  const { count: outCount } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true })
    .like('notes', `${SIM_TAG}%`)
    .eq('transaction_type', 'ADJUSTMENT_MINUS');

  const { count: inCount } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true })
    .like('notes', `${SIM_TAG}%`)
    .eq('transaction_type', 'ADJUSTMENT_PLUS');

  console.log(`\n  SIM-F transaction rows       : ${(simFCount||0).toLocaleString()}`);
  console.log(`  ADJUSTMENT_MINUS (write-offs): ${(outCount||0).toLocaleString()}`);
  console.log(`  ADJUSTMENT_PLUS  (additions) : ${(inCount||0).toLocaleString()}`);
  console.log(`  Net direction                : ${(outCount||0) > (inCount||0) ? 'Net write-off (correct)' : 'Net addition'}`);
  console.log(`  inventory rows updated       : ${invUpdated}`);

  // Non-negative check
  const { count: negCount } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .lt('quantity_on_hand', 0);
  console.log(`\n  Negative qty_on_hand rows    : ${negCount||0} (must be 0)`);
  console.log(`  IC-02 status                 : ${(negCount||0)===0 ? 'PASS' : 'FAIL — investigate'}`);

  // View checks
  const views = [
    'vw_adjustment_activity',
    'vw_out_of_stock_inventory',
    'vw_inventory_value_by_pharmacy',
    'vw_expired_inventory',
  ];
  console.log('\n  ANALYTICAL VIEW SPOT CHECKS');
  printLine();
  for (const v of views) {
    const { count, error } = await supabase
      .from(v).select('*', { count: 'exact', head: true });
    const status = error ? `ERROR: ${error.message}` : `${(count||0).toLocaleString()} rows`;
    console.log(`  ${v.padEnd(36)} : ${status}`);
  }

  // Summary of all simulation modules
  console.log('\n  FULL SIMULATION SUMMARY');
  printLine();

  const simModules = [
    { tag: 'SIM-B', table: 'inventory',             col: 'batch_number',    label: 'Module B — Inventory rows' },
    { tag: 'SIM-D', table: 'inventory_transactions', col: 'notes',           label: 'Module D — Dispense events' },
    { tag: 'SIM-E', table: 'inventory_transactions', col: 'notes',           label: 'Module E — Transfer txns' },
    { tag: 'SIM-F', table: 'inventory_transactions', col: 'notes',           label: 'Module F — Adjustment txns' },
    { tag: 'SIM-G', table: 'stock_count_sessions',   col: 'session_name',    label: 'Module G — Stock count sessions' },
  ];

  for (const m of simModules) {
    const { count } = await supabase
      .from(m.table)
      .select('*', { count: 'exact', head: true })
      .like(m.col, `${m.tag}%`);
    console.log(`  ${m.label.padEnd(38)} : ${(count||0).toLocaleString()}`);
  }

  // Total inventory_transactions
  const { count: totalTxn } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true });
  console.log(`\n  Total inventory_transactions : ${(totalTxn||0).toLocaleString()}`);

  printLine('=');
  console.log('\n  MODULE F COMPLETE — SIMULATION INFRASTRUCTURE COMPLETE\n');
  console.log('  All modules (B, D, E, F, G) have been executed.');
  console.log('  FalconMed v3 is ready for Power BI export validation.\n');
  printLine('=');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  FalconMed Simulator v1 - Module F: Adjustment Simulation');
  console.log(`  ${new Date().toISOString()}\n`);

  if (ROLLBACK_MODE) { await rollback(); return; }

  // Phase 0: Load data
  console.log('  Phase 0: Loading live data...');
  printLine();

  let pharmacies, orgId, existingSimF;
  try {
    pharmacies    = await loadPharmacies();
    orgId         = await loadOrgId(pharmacies);
    existingSimF  = await countExistingSimF();
    console.log(`  OK  org ID resolved`);
  } catch (err) {
    console.error(`\n  Phase 0 failed: ${err.message}`); process.exit(1);
  }

  if (existingSimF > 0) {
    console.warn(`\n  WARN: ${existingSimF} SIM-F records already exist.`);
    console.warn('  Run --rollback first to reset.\n');
    process.exit(0);
  }

  // Phase 1: Build adjustment events per pharmacy
  console.log('\n  Phase 1: Building adjustment events...');
  printLine();

  const totalTarget  = randInt(TARGET_MIN, TARGET_MAX);
  const perPharmacy  = Math.ceil(totalTarget / pharmacies.length);
  const allEvents    = [];
  const qtyTracker   = new Map();

  let pharmDone = 0;
  for (const pharm of pharmacies) {
    pharmDone++;
    process.stdout.write(`\r  ${progressBar(pharmDone, pharmacies.length)} Loading pharmacy inventory...`);

    let invRows;
    try {
      invRows = await loadInventoryForPharmacy(pharm.id);
    } catch (err) {
      console.warn(`\n  WARN: Could not load inventory for ${pharm.id}: ${err.message}`);
      continue;
    }

    // Seed qty tracker
    invRows.forEach(r => qtyTracker.set(r.id, r.quantity_on_hand));

    const events = buildAdjustmentsForPharmacy(pharm, invRows, perPharmacy, qtyTracker);
    allEvents.push(...events);
  }

  console.log(`\n\n  OK  ${allEvents.length} adjustment events built (target: ${TARGET_MIN}–${TARGET_MAX})`);

  if (allEvents.length === 0) {
    console.warn('\n  WARN: No adjustment events could be built.');
    console.warn('  Check that inventory rows exist with quantity > 0.\n');
    process.exit(0);
  }

  // Manifest + confirm
  printManifest(allEvents, existingSimF);
  const confirmed = await confirmProceed(allEvents.length);
  if (!confirmed) { console.log('\n  Aborted. No data written.\n'); process.exit(0); }

  // Phase 2: Insert transactions
  console.log('\n  Phase 2: Inserting adjustment transactions...');
  printLine();

  let txnInserted = 0;
  try {
    txnInserted = await insertAdjustments(allEvents, orgId);
    console.log(`  OK  ${txnInserted} transaction rows inserted`);
  } catch (err) {
    console.error(`\n  ERROR: ${err.message}`);
    console.error('  Run --rollback then retry.\n');
    process.exit(1);
  }

  // Phase 3: Update inventory
  console.log('\n  Phase 3: Updating inventory quantities...');
  printLine();

  let invUpdated = 0;
  try {
    invUpdated = await flushInventoryUpdates(allEvents, qtyTracker);
  } catch (err) {
    console.error(`\n  ERROR updating inventory: ${err.message}`);
  }

  // Validation + full summary
  if (!DRY_RUN) {
    await validationReport(txnInserted, invUpdated, allEvents);
  } else {
    const outCount = allEvents.filter(e => e.adjType === 'ADJUSTMENT_MINUS').length;
    const inCount  = allEvents.filter(e => e.adjType === 'ADJUSTMENT_PLUS').length;
    console.log(`\n  DRY RUN complete.`);
    console.log(`  Would insert : ${allEvents.length} adjustment rows`);
    console.log(`  ADJUSTMENT_MINUS : ${outCount}`);
    console.log(`  ADJUSTMENT_PLUS  : ${inCount}\n`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('\n  Unexpected error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
