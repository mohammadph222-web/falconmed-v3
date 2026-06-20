/**
 * FalconMed Simulator v1 — Module E: Transfer Simulation
 * File: scripts/simulation/seed_module_e.cjs
 *
 * PURPOSE:
 *   Generates 300–400 inter-pharmacy stock transfer events.
 *   Two strategies:
 *     - 70% Near-Expiry Driven: NE surplus pharmacy → high-consumption pharmacy
 *       with OOS or low stock for the same drug. Reduces expiry risk.
 *     - 30% Operational: Normal network balancing for OOS and low-stock situations.
 *
 * WRITES TO:
 *   1. inventory_transactions  (type = 'TRANSFER_OUT' + 'TRANSFER_IN' per event)
 *   2. inventory               (source qty decremented, destination qty incremented)
 *
 * RULES:
 *   - APPEND ONLY — no modification of existing simulation data
 *   - Non-negative guarantee — source qty never goes below 0
 *   - Each transfer = 2 inventory_transactions rows (OUT + IN)
 *   - Inventory updated in-memory, flushed at end per pharmacy
 *   - SIM-E tag in notes for rollback identification
 *   - Idempotent — checks existing SIM-E count before inserting
 *   - Date range: within Module D simulation window (2026-03-19 → 2026-06-19)
 *
 * RUN:
 *   node scripts/simulation/seed_module_e.cjs --dry-run
 *   node scripts/simulation/seed_module_e.cjs
 *   node scripts/simulation/seed_module_e.cjs --rollback
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

const SIM_TAG         = 'SIM-E';
const TARGET_MIN      = 300;
const TARGET_MAX      = 400;
const NE_DRIVEN_PCT   = 0.70;   // 70% near-expiry driven
const OPS_PCT         = 0.30;   // 30% operational balancing
const DRY_RUN         = process.argv.includes('--dry-run');
const ROLLBACK_MODE   = process.argv.includes('--rollback');
const BATCH_SIZE      = 100;

// Date range for transfer timestamps (within Module D window)
const SIM_START = new Date('2026-03-19T00:00:00.000Z');
const SIM_END   = new Date('2026-06-19T23:59:59.000Z');

// Transfer qty ranges by drug cost
const TRANSFER_QTY_BANDS = [
  { maxCost:    5, min: 20, max: 100 },
  { maxCost:   50, min: 10, max:  50 },
  { maxCost:  200, min:  5, max:  20 },
  { maxCost: 1000, min:  1, max:   5 },
  { maxCost: Infinity, min: 1, max: 2 },
];

// High-consumption pharmacy types (NE transfers prefer these as destinations)
const HIGH_CONSUMPTION_TYPES = ['MAIN', 'ER', 'ICU', 'OR', 'PEDIATRIC'];

// Low-consumption pharmacy types (NE transfers prefer these as sources)
const LOW_CONSUMPTION_TYPES  = ['RETAIL', 'COMMUNITY', 'AMBULATORY', 'PHARMACY'];

// ─── Utilities ────────────────────────────────────────────────────────────────

const randInt   = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick      = (arr) => arr[Math.floor(Math.random() * arr.length)];
const printLine = (c = '-', n = 72) => console.log(c.repeat(n));

function randomTimestamp() {
  const span = SIM_END.getTime() - SIM_START.getTime();
  return new Date(SIM_START.getTime() + Math.random() * span).toISOString();
}

function transferQtyForCost(cost) {
  for (const b of TRANSFER_QTY_BANDS) {
    if (cost <= b.maxCost) return randInt(b.min, b.max);
  }
  return 1;
}

function resolvePharmType(pharm) {
  const col = ['pharmacy_type','type','category','facility_type']
    .find(c => c in pharm && pharm[c]);
  return col ? String(pharm[col]).trim().toUpperCase() : 'DEFAULT';
}

function pharmName(pharm) {
  return pharm.pharmacy_name || pharm.name || pharm.id;
}

function progressBar(cur, tot, w = 28) {
  const f = Math.round((cur / (tot || 1)) * w);
  return `[${'█'.repeat(f)}${'░'.repeat(w - f)}] ${cur}/${tot}`;
}

// ─── Rollback ────────────────────────────────────────────────────────────────

async function rollback() {
  printLine('=');
  console.log('  ROLLBACK MODE — removing SIM-E transfer records');
  printLine('=');

  const { count } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true })
    .like('notes', `${SIM_TAG}%`);

  console.log(`\n  SIM-E inventory_transactions : ${count || 0}`);
  if (!count) { console.log('\n  Nothing to rollback.\n'); process.exit(0); }

  await new Promise(resolve => {
    process.stdout.write('\n  Type YES to confirm rollback: ');
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', d => {
      if (d.trim().toUpperCase() !== 'YES') { console.log('  Aborted.\n'); process.exit(0); }
      resolve();
    });
  });

  // NOTE: inventory quantity_on_hand was updated in-place.
  // Rolling back transactions does NOT auto-restore inventory qtys.
  // After rollback, restore inventory from a Supabase backup or re-run Module B+D.
  console.log('\n  WARN: inventory.quantity_on_hand changes cannot be auto-reversed.');
  console.log('  Deleting transaction records only...\n');

  const PAGE = 500;
  let deleted = 0;
  while (true) {
    const { data } = await supabase
      .from('inventory_transactions')
      .select('id')
      .like('notes', `${SIM_TAG}%`)
      .limit(PAGE);
    if (!data?.length) break;
    await supabase.from('inventory_transactions')
      .delete().in('id', data.map(r => r.id));
    deleted += data.length;
    process.stdout.write(`\r  Deleted ${deleted} records...`);
  }

  console.log(`\n\n  Deleted ${deleted} SIM-E inventory_transaction rows.`);
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

  return active.map(p => ({ ...p, _type: resolvePharmType(p), _name: pharmName(p) }));
}

async function loadOrgId(pharmacies) {
  const id = pharmacies[0]?.organization_id;
  if (!id) throw new Error('organization_id missing.');
  return id;
}

async function loadInventorySnapshot(pharmacies) {
  // Load all active inventory rows across all pharmacies in one query
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('inventory')
    .select('id, pharmacy_id, drug_code, quantity_on_hand, expiry_date, unit_cost, batch_number, minimum_stock')
    .gt('quantity_on_hand', 0)
    .gte('expiry_date', today)
    .order('expiry_date', { ascending: true });

  if (error) throw new Error(`inventory snapshot: ${error.message}`);

  // Index by pharmacy_id
  const byPharmacy = new Map();
  for (const row of data || []) {
    if (!byPharmacy.has(row.pharmacy_id)) byPharmacy.set(row.pharmacy_id, []);
    byPharmacy.get(row.pharmacy_id).push(row);
  }

  console.log(`  OK  ${(data||[]).length.toLocaleString()} inventory rows loaded across ${byPharmacy.size} pharmacies`);
  return byPharmacy;
}

async function countExistingSimE() {
  const { count, error } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true })
    .like('notes', `${SIM_TAG}%`);
  if (error) throw new Error(`SIM-E count: ${error.message}`);
  return count || 0;
}

// ─── Transfer Candidate Builders ──────────────────────────────────────────────

/**
 * STRATEGY 1 (70%): Near-Expiry Driven Transfers
 * Source: low-consumption pharmacy with NE stock (expiry ≤ 90 days)
 * Destination: high-consumption pharmacy with OOS or low stock for same drug
 */
function buildNEDrivenCandidates(pharmacies, invByPharmacy, qtyTracker) {
  const today90 = new Date();
  today90.setDate(today90.getDate() + 90);
  const today90Str = today90.toISOString().split('T')[0];
  const todayStr   = new Date().toISOString().split('T')[0];

  const candidates = [];

  // Find low-consumption pharmacies with NE stock
  const lowPharms = pharmacies.filter(p => LOW_CONSUMPTION_TYPES.includes(p._type));
  const highPharms = pharmacies.filter(p => HIGH_CONSUMPTION_TYPES.includes(p._type));

  if (lowPharms.length === 0 || highPharms.length === 0) {
    // Fallback: use all pharmacies
    lowPharms.push(...pharmacies.slice(0, Math.ceil(pharmacies.length / 2)));
    highPharms.push(...pharmacies.slice(Math.ceil(pharmacies.length / 2)));
  }

  for (const srcPharm of lowPharms) {
    const srcInv = invByPharmacy.get(srcPharm.id) || [];
    // Filter to NE rows at source
    const neRows = srcInv.filter(r =>
      r.expiry_date <= today90Str &&
      r.expiry_date >= todayStr &&
      (qtyTracker.get(r.id) ?? r.quantity_on_hand) > 5
    );

    for (const neRow of neRows) {
      // Find a high-consumption pharmacy that has OOS or low stock for this drug
      for (const dstPharm of highPharms) {
        if (dstPharm.id === srcPharm.id) continue;
        const dstInv = invByPharmacy.get(dstPharm.id) || [];
        const dstRow = dstInv.find(r => r.drug_code === neRow.drug_code);

        const dstQty = dstRow
          ? (qtyTracker.get(dstRow.id) ?? dstRow.quantity_on_hand)
          : 0;
        const dstMin = dstRow?.minimum_stock ?? 20;

        // Only transfer if destination is OOS or below minimum
        if (dstQty <= dstMin) {
          candidates.push({
            strategy:    'NE_DRIVEN',
            srcPharm,
            dstPharm,
            srcRow:      neRow,
            dstRow:      dstRow || null,
            drugCode:    neRow.drug_code,
            unitCost:    parseFloat(neRow.unit_cost) || 0,
            batchNumber: neRow.batch_number,
            expiryDate:  neRow.expiry_date,
            priority:    dstQty === 0 ? 2 : 1,  // OOS gets higher priority
          });
        }
      }
    }
  }

  // Sort by priority (OOS first), then by earliest expiry
  return candidates.sort((a, b) => b.priority - a.priority || a.expiryDate.localeCompare(b.expiryDate));
}

/**
 * STRATEGY 2 (30%): Operational Balancing Transfers
 * Source: any pharmacy with healthy stock
 * Destination: any pharmacy with OOS or low stock for same drug
 */
function buildOperationalCandidates(pharmacies, invByPharmacy, qtyTracker) {
  const candidates = [];

  for (const dstPharm of pharmacies) {
    const dstInv = invByPharmacy.get(dstPharm.id) || [];

    // Find OOS or low-stock items at destination
    const needyRows = dstInv.filter(r => {
      const qty = qtyTracker.get(r.id) ?? r.quantity_on_hand;
      return qty <= (r.minimum_stock || 20);
    });

    for (const needyRow of needyRows) {
      // Find any other pharmacy with surplus of same drug
      for (const srcPharm of pharmacies) {
        if (srcPharm.id === dstPharm.id) continue;
        const srcInv = invByPharmacy.get(srcPharm.id) || [];
        const srcRow = srcInv.find(r => r.drug_code === needyRow.drug_code);
        if (!srcRow) continue;

        const srcQty = qtyTracker.get(srcRow.id) ?? srcRow.quantity_on_hand;
        const srcMin = srcRow.minimum_stock || 20;

        // Only transfer if source has surplus above its own minimum
        if (srcQty > srcMin * 1.5) {
          candidates.push({
            strategy:    'OPERATIONAL',
            srcPharm,
            dstPharm,
            srcRow,
            dstRow:      needyRow,
            drugCode:    needyRow.drug_code,
            unitCost:    parseFloat(srcRow.unit_cost) || 0,
            batchNumber: srcRow.batch_number,
            expiryDate:  srcRow.expiry_date,
            priority:    1,
          });
        }
      }
    }
  }

  return candidates;
}

// ─── Build Transfer Events ────────────────────────────────────────────────────

function selectTransfers(neCandidates, opsCandidates, qtyTracker) {
  const totalTarget = randInt(TARGET_MIN, TARGET_MAX);
  const neTarget    = Math.round(totalTarget * NE_DRIVEN_PCT);
  const opsTarget   = totalTarget - neTarget;

  const selected = [];
  const usedPairs = new Set(); // prevent duplicate src→dst→drug pairs

  function tryAdd(candidate, limit, arr) {
    if (arr.filter(t => t.strategy === candidate.strategy).length >= limit) return false;

    const pairKey = `${candidate.srcPharm.id}-${candidate.dstPharm.id}-${candidate.drugCode}`;
    if (usedPairs.has(pairKey)) return false;

    const srcQty     = qtyTracker.get(candidate.srcRow.id) ?? candidate.srcRow.quantity_on_hand;
    const transferQty = Math.min(
      transferQtyForCost(candidate.unitCost),
      Math.floor(srcQty * 0.5)  // never transfer more than 50% of source stock
    );
    if (transferQty < 1) return false;

    usedPairs.add(pairKey);
    // Decrement source in tracker
    qtyTracker.set(candidate.srcRow.id, srcQty - transferQty);

    arr.push({ ...candidate, transferQty, timestamp: randomTimestamp() });
    return true;
  }

  // Fill NE-driven first (priority sorted)
  for (const c of neCandidates) {
    if (!tryAdd(c, neTarget, selected)) continue;
    if (selected.filter(t => t.strategy === 'NE_DRIVEN').length >= neTarget) break;
  }

  // Fill operational (shuffle for variety)
  const shuffledOps = [...opsCandidates].sort(() => Math.random() - 0.5);
  for (const c of shuffledOps) {
    if (!tryAdd(c, opsTarget, selected)) continue;
    if (selected.filter(t => t.strategy === 'OPERATIONAL').length >= opsTarget) break;
  }

  return selected;
}

// ─── Insert Transfers ────────────────────────────────────────────────────────

async function insertTransfers(transfers, orgId) {
  if (transfers.length === 0) return 0;

  // Build TRANSFER_OUT + TRANSFER_IN rows
  const txnRows = [];
  for (const t of transfers) {
    const baseNote = `${SIM_TAG}|${t.strategy}|${t.drugCode}|qty:${t.transferQty}`;

    // TRANSFER_OUT — source pharmacy
    txnRows.push({
      organization_id:        orgId,
      source_pharmacy_id:     t.srcPharm.id,
      destination_pharmacy_id: t.dstPharm.id,
      drug_code:              t.drugCode,
      quantity:               t.transferQty,
      transaction_type:       'TRANSFER_OUT',
      notes:                  baseNote,
      created_at:             t.timestamp,
    });

    // TRANSFER_IN — destination pharmacy
    txnRows.push({
      organization_id:        orgId,
      source_pharmacy_id:     t.srcPharm.id,
      destination_pharmacy_id: t.dstPharm.id,
      drug_code:              t.drugCode,
      quantity:               t.transferQty,
      transaction_type:       'TRANSFER_IN',
      notes:                  baseNote,
      created_at:             t.timestamp,
    });
  }

  if (DRY_RUN) {
    console.log(`  DRY RUN: would insert ${txnRows.length} transaction rows`);
    return txnRows.length;
  }

  let inserted = 0;
  for (let i = 0; i < txnRows.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from('inventory_transactions')
      .insert(txnRows.slice(i, i + BATCH_SIZE));
    if (error) throw new Error(`inventory_transactions insert: ${error.message}`);
    inserted += Math.min(BATCH_SIZE, txnRows.length - i);
  }
  return inserted;
}

async function flushInventoryUpdates(transfers, qtyTracker) {
  // Build final qty map — net result per inventory row
  // Source rows: already decremented in qtyTracker during selection
  // Destination rows: need to be incremented

  const updateMap = new Map(); // inventoryId → new absolute qty

  for (const t of transfers) {
    // Source: qty already decremented in qtyTracker — apply it
    const srcId  = t.srcRow.id;
    const srcQty = qtyTracker.get(srcId) ?? t.srcRow.quantity_on_hand;
    updateMap.set(srcId, Math.max(0, srcQty));

    // Destination: increment quantity_on_hand
    if (t.dstRow) {
      const dstId      = t.dstRow.id;
      const currentDst = updateMap.get(dstId) ?? (qtyTracker.get(dstId) ?? t.dstRow.quantity_on_hand);
      updateMap.set(dstId, currentDst + t.transferQty);
    }
    // If no dstRow (destination had zero stock, no inventory row), skip qty update
    // — the transfer is recorded in transactions but inventory row doesn't exist yet
  }

  if (DRY_RUN) {
    console.log(`  DRY RUN: would update ${updateMap.size} inventory rows`);
    return updateMap.size;
  }

  const now = new Date().toISOString();
  let updated = 0;
  const entries = [...updateMap.entries()];

  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    await Promise.all(batch.map(([id, newQty]) =>
      supabase.from('inventory').update({
        quantity_on_hand: newQty,
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

function printManifest(transfers, existingSimE) {
  const neCount  = transfers.filter(t => t.strategy === 'NE_DRIVEN').length;
  const opsCount = transfers.filter(t => t.strategy === 'OPERATIONAL').length;

  printLine('=');
  console.log('  FALCONMED SIMULATOR v1 - MODULE E: TRANSFER SIMULATION');
  printLine('=');
  console.log(`\n  Mode                 : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE INSERT'}`);
  console.log(`  Existing SIM-E txns  : ${existingSimE}`);
  console.log(`  Total transfers      : ${transfers.length}`);
  console.log(`  NE-Driven (70%)      : ${neCount} transfers`);
  console.log(`  Operational (30%)    : ${opsCount} transfers`);
  console.log(`  Transaction rows     : ${transfers.length * 2} (TRANSFER_OUT + TRANSFER_IN each)`);

  console.log('\n  TRANSFER STRATEGY BREAKDOWN');
  printLine();

  // Sample breakdown
  const neByDrug = {};
  transfers.filter(t => t.strategy === 'NE_DRIVEN').forEach(t => {
    neByDrug[t.drugCode] = (neByDrug[t.drugCode] || 0) + 1;
  });
  const topNE = Object.entries(neByDrug).sort((a,b)=>b[1]-a[1]).slice(0,5);
  console.log('  Top 5 NE-Driven drugs by transfer frequency:');
  topNE.forEach(([dc, n]) => console.log(`    ${dc.padEnd(25)} ${n} transfers`));

  console.log('\n  TABLES TO BE WRITTEN');
  printLine();
  console.log(`  inventory_transactions : +${transfers.length * 2} rows (TRANSFER_OUT + TRANSFER_IN)`);
  console.log(`  inventory              : quantity_on_hand updated (source − qty, destination + qty)`);
  printLine('=');
}

// ─── Confirm ────────────────────────────────────────────────────────────────

async function confirmProceed(count) {
  if (DRY_RUN) { console.log('\n  DRY RUN — no data will be written.\n'); return true; }
  return new Promise(resolve => {
    process.stdout.write(`\n  Insert ${count} transfers (${count*2} txn rows)? Type YES: `);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', d => resolve(d.trim().toUpperCase() === 'YES'));
  });
}

// ─── Validation Report ───────────────────────────────────────────────────────

async function validationReport(txnInserted, invUpdated, transfers) {
  printLine('=');
  console.log('  MODULE E — VALIDATION REPORT');
  printLine('=');

  const { count: simECount } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true })
    .like('notes', `${SIM_TAG}%`);

  const { count: outCount } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true })
    .like('notes', `${SIM_TAG}%`)
    .eq('transaction_type', 'TRANSFER_OUT');

  const { count: inCount } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true })
    .like('notes', `${SIM_TAG}%`)
    .eq('transaction_type', 'TRANSFER_IN');

  console.log(`\n  SIM-E transaction rows total : ${(simECount||0).toLocaleString()}`);
  console.log(`  TRANSFER_OUT rows            : ${(outCount||0).toLocaleString()}`);
  console.log(`  TRANSFER_IN rows             : ${(inCount||0).toLocaleString()}`);
  console.log(`  OUT = IN (balanced)          : ${outCount === inCount ? 'PASS' : 'FAIL'}`);
  console.log(`  inventory rows updated       : ${invUpdated.toLocaleString()}`);

  // Strategy breakdown
  const neCount  = transfers.filter(t => t.strategy === 'NE_DRIVEN').length;
  const opsCount = transfers.filter(t => t.strategy === 'OPERATIONAL').length;
  console.log(`\n  NE-Driven transfers          : ${neCount} (${Math.round(neCount/transfers.length*100)}%)`);
  console.log(`  Operational transfers        : ${opsCount} (${Math.round(opsCount/transfers.length*100)}%)`);

  // Non-negative check
  const { count: negCount } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .lt('quantity_on_hand', 0);
  console.log(`\n  Negative qty_on_hand rows    : ${negCount||0} (must be 0)`);
  console.log(`  IC-02 status                 : ${(negCount||0)===0 ? 'PASS' : 'FAIL — investigate'}`);

  // View check
  const { count: viewCount } = await supabase
    .from('vw_transfer_activity')
    .select('*', { count: 'exact', head: true });
  console.log(`\n  vw_transfer_activity rows    : ${(viewCount||0).toLocaleString()} (was 0 before Module E)`);

  printLine('=');
  console.log('\n  MODULE E COMPLETE — READY FOR MODULE F (ADJUSTMENTS)\n');
  printLine('=');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  FalconMed Simulator v1 - Module E: Transfer Simulation');
  console.log(`  ${new Date().toISOString()}\n`);

  if (ROLLBACK_MODE) { await rollback(); return; }

  // Phase 0: Load data
  console.log('  Phase 0: Loading live data...');
  printLine();

  let pharmacies, orgId, invByPharmacy, existingSimE;
  try {
    pharmacies    = await loadPharmacies();
    orgId         = await loadOrgId(pharmacies);
    invByPharmacy = await loadInventorySnapshot(pharmacies);
    existingSimE  = await countExistingSimE();
    console.log(`  OK  ${pharmacies.length} pharmacies · org ID resolved`);
  } catch (err) {
    console.error(`\n  Phase 0 failed: ${err.message}`); process.exit(1);
  }

  if (existingSimE > 0) {
    console.warn(`\n  WARN: ${existingSimE} SIM-E records already exist.`);
    console.warn('  Run --rollback first to reset.\n');
    process.exit(0);
  }

  // Phase 1: Build transfer candidates
  console.log('\n  Phase 1: Building transfer candidates...');
  printLine();

  // In-memory qty tracker seeded from live inventory
  const qtyTracker = new Map();
  for (const rows of invByPharmacy.values()) {
    for (const row of rows) {
      qtyTracker.set(row.id, row.quantity_on_hand);
    }
  }

  const neCandidates  = buildNEDrivenCandidates(pharmacies, invByPharmacy, qtyTracker);
  const opsCandidates = buildOperationalCandidates(pharmacies, invByPharmacy, qtyTracker);
  console.log(`  OK  ${neCandidates.length} NE-driven candidates identified`);
  console.log(`  OK  ${opsCandidates.length} operational candidates identified`);

  // Reset tracker — will be re-applied during selection
  for (const rows of invByPharmacy.values()) {
    for (const row of rows) {
      qtyTracker.set(row.id, row.quantity_on_hand);
    }
  }

  // Select final transfers
  const transfers = selectTransfers(neCandidates, opsCandidates, qtyTracker);
  console.log(`  OK  ${transfers.length} transfers selected (target: ${TARGET_MIN}–${TARGET_MAX})`);

  if (transfers.length === 0) {
    console.warn('\n  WARN: No valid transfers found.');
    console.warn('  This may indicate insufficient NE or low-stock items in inventory.');
    console.warn('  Check that Module B and D have completed successfully.\n');
    process.exit(0);
  }

  // Manifest + confirm
  printManifest(transfers, existingSimE);
  const confirmed = await confirmProceed(transfers.length);
  if (!confirmed) { console.log('\n  Aborted. No data written.\n'); process.exit(0); }

  // Phase 2: Insert transaction records
  console.log('\n  Phase 2: Inserting transfer transactions...');
  printLine();
  let txnInserted = 0;
  try {
    txnInserted = await insertTransfers(transfers, orgId);
    console.log(`  OK  ${txnInserted} transaction rows inserted`);
  } catch (err) {
    console.error(`\n  ERROR inserting transactions: ${err.message}`);
    console.error('  Re-run with --rollback then retry.\n');
    process.exit(1);
  }

  // Phase 3: Update inventory quantities
  console.log('\n  Phase 3: Updating inventory quantities...');
  printLine();
  let invUpdated = 0;
  try {
    invUpdated = await flushInventoryUpdates(transfers, qtyTracker);
  } catch (err) {
    console.error(`\n  ERROR updating inventory: ${err.message}`);
    console.error('  Transactions inserted but inventory not updated — investigate.\n');
  }

  // Validation report
  if (!DRY_RUN) {
    await validationReport(txnInserted, invUpdated, transfers);
  } else {
    console.log(`\n  DRY RUN complete.`);
    console.log(`  Would insert: ${transfers.length * 2} transaction rows`);
    console.log(`  Would update: ~${transfers.length * 1.5 | 0} inventory rows`);
    console.log(`  NE-Driven: ${transfers.filter(t=>t.strategy==='NE_DRIVEN').length}`);
    console.log(`  Operational: ${transfers.filter(t=>t.strategy==='OPERATIONAL').length}\n`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('\n  Unexpected error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
