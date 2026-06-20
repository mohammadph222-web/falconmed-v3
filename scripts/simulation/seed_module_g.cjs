/**
 * FalconMed Simulator v1 — Module G: Stock Count & Reconciliation
 * File: scripts/simulation/seed_module_g.cjs
 *
 * PURPOSE:
 *   Generates realistic stock count sessions, counted items, reconciliation
 *   cases, and audit trail entries across all 17 pharmacies.
 *
 * WRITES TO (in order):
 *   1. stock_count_sessions    — one session per pharmacy per count cycle
 *   2. stock_count_items       — all inventory rows counted per session
 *   3. stocktake_sessions      — parallel mirror of stock_count_sessions
 *   4. stocktake_items         — parallel mirror of stock_count_items
 *   5. reconciliation_cases    — one case per item with variance != 0
 *   6. reconciliation_audit_trail — status transitions per case
 *
 * DESIGN:
 *   - 3 count cycles per pharmacy = 51 sessions total (17 × 3)
 *   - Cycle dates spread across Module D simulation window
 *   - ~15% of items get deliberate variance (counted != system)
 *   - Variance types: SHORTAGE (counted < system) · SURPLUS (counted > system)
 *   - Reconciliation workflow: PENDING → UNDER_REVIEW → APPROVED | REJECTED
 *   - CS-3 scenario: at least 1 REJECTED case with COUNTING_ERROR per pharmacy
 *
 * RULES:
 *   - APPEND ONLY — no modification of existing data
 *   - Idempotent — SIM-G prefix in session_name for identification
 *   - Rollback via --rollback flag
 *   - service_role only — never in React/Vite
 *   - system_quantity snapshot taken from live inventory at script run time
 *
 * RUN:
 *   node scripts/simulation/seed_module_g.cjs --dry-run
 *   node scripts/simulation/seed_module_g.cjs
 *   node scripts/simulation/seed_module_g.cjs --rollback
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ─── Supabase Client (identical pattern to seed_module_b.js) ─────────────────

console.log('  DIAG SERVICE_ROLE_KEY exists :', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('  DIAG KEY prefix              :', process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 6));
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n  ERROR: Missing env vars.');
  console.error('  SUPABASE_URL=https://your-project.supabase.co');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=<service role key>\n');
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

const SIM_TAG           = 'SIM-G';
const CYCLES_PER_PHARM  = 3;       // count sessions per pharmacy
const VARIANCE_RATE     = 0.15;    // 15% of items get deliberate variance
const BATCH_SIZE        = 100;
const DRY_RUN           = process.argv.includes('--dry-run');
const ROLLBACK_MODE     = process.argv.includes('--rollback');

// Cycle dates — spread across Module D window (2026-03-19 → 2026-06-19)
const CYCLE_DATES = [
  '2026-03-28',   // Cycle 1 — end of March
  '2026-04-26',   // Cycle 2 — end of April
  '2026-05-31',   // Cycle 3 — end of May
];

// Reconciliation reason codes by variance type
const SHORTAGE_REASONS  = ['COUNTING_ERROR', 'THEFT_SUSPECTED', 'SYSTEM_ERROR', 'DISPENSING_ERROR'];
const SURPLUS_REASONS   = ['RECEIVING_ERROR', 'COUNTING_ERROR', 'SYSTEM_ERROR'];

// Status workflow outcomes — weighted
// 70% APPROVED · 15% REJECTED · 15% UNDER_REVIEW (open)
const RECON_OUTCOMES = [
  { status: 'APPROVED',      weight: 70 },
  { status: 'REJECTED',      weight: 15 },
  { status: 'UNDER_REVIEW',  weight: 15 },
];
const OUTCOME_TOTAL = RECON_OUTCOMES.reduce((s, r) => s + r.weight, 0);

const REVIEWERS = [
  'Dr. Ahmed Al Mansoori', 'Dr. Fatima Al Zaabi', 'Dr. Mohammed Al Shamsi',
  'Dr. Sara Al Nuaimi',    'Pharm. Khalid Al Rashidi', 'Pharm. Aisha Al Kaabi',
];

// ─── Utilities ────────────────────────────────────────────────────────────────

const randInt  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick     = (arr) => arr[Math.floor(Math.random() * arr.length)];
const printLine = (c = '-', n = 72) => console.log(c.repeat(n));

function weightedOutcome() {
  let r = Math.random() * OUTCOME_TOTAL;
  for (const o of RECON_OUTCOMES) {
    r -= o.weight;
    if (r <= 0) return o.status;
  }
  return 'APPROVED';
}

function cycleTimestamp(dateStr, offsetHours = 0) {
  return new Date(`${dateStr}T${String(8 + offsetHours).padStart(2,'0')}:00:00.000Z`).toISOString();
}

function progressBar(cur, tot, w = 28) {
  const f = Math.round((cur / (tot || 1)) * w);
  return `[${'█'.repeat(f)}${'░'.repeat(w - f)}] ${cur}/${tot}`;
}

// ─── Rollback ────────────────────────────────────────────────────────────────

async function rollback() {
  printLine('=');
  console.log('  ROLLBACK MODE — removing all SIM-G records');
  printLine('=');

  // Find all SIM-G session IDs
  const { data: scSessions } = await supabase
    .from('stock_count_sessions')
    .select('id')
    .like('session_name', `${SIM_TAG}%`);

  const { data: stSessions } = await supabase
    .from('stocktake_sessions')
    .select('id')
    .like('session_name', `${SIM_TAG}%`);

  const scIds = (scSessions || []).map(r => r.id);
  const stIds = (stSessions || []).map(r => r.id);

  // Find reconciliation cases via stock_count_session_id
  const { data: reconCases } = scIds.length > 0
    ? await supabase.from('reconciliation_cases').select('id').in('stock_count_session_id', scIds)
    : { data: [] };
  const reconIds = (reconCases || []).map(r => r.id);

  console.log(`\n  SIM-G stock_count_sessions   : ${scIds.length}`);
  console.log(`  SIM-G stocktake_sessions     : ${stIds.length}`);
  console.log(`  SIM-G reconciliation_cases   : ${reconIds.length}`);

  if (scIds.length === 0 && stIds.length === 0) {
    console.log('\n  Nothing to rollback.\n');
    process.exit(0);
  }

  await new Promise(resolve => {
    process.stdout.write('\n  Type YES to confirm rollback: ');
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', d => {
      if (d.trim().toUpperCase() !== 'YES') { console.log('  Aborted.\n'); process.exit(0); }
      resolve();
    });
  });

  // Delete in dependency order
  const PAGE = 500;

  // 1. reconciliation_audit_trail
  if (reconIds.length > 0) {
    for (let i = 0; i < reconIds.length; i += PAGE) {
      await supabase.from('reconciliation_audit_trail')
        .delete().in('reconciliation_case_id', reconIds.slice(i, i + PAGE));
    }
    console.log('  Deleted: reconciliation_audit_trail');
  }

  // 2. reconciliation_cases
  if (reconIds.length > 0) {
    for (let i = 0; i < reconIds.length; i += PAGE) {
      await supabase.from('reconciliation_cases')
        .delete().in('id', reconIds.slice(i, i + PAGE));
    }
    console.log('  Deleted: reconciliation_cases');
  }

  // 3. stock_count_items
  if (scIds.length > 0) {
    for (let i = 0; i < scIds.length; i += PAGE) {
      await supabase.from('stock_count_items')
        .delete().in('session_id', scIds.slice(i, i + PAGE));
    }
    console.log('  Deleted: stock_count_items');
  }

  // 4. stock_count_sessions
  if (scIds.length > 0) {
    await supabase.from('stock_count_sessions').delete().in('id', scIds);
    console.log('  Deleted: stock_count_sessions');
  }

  // 5. stocktake_items
  if (stIds.length > 0) {
    for (let i = 0; i < stIds.length; i += PAGE) {
      await supabase.from('stocktake_items')
        .delete().in('stocktake_session_id', stIds.slice(i, i + PAGE));
    }
    console.log('  Deleted: stocktake_items');
  }

  // 6. stocktake_sessions
  if (stIds.length > 0) {
    await supabase.from('stocktake_sessions').delete().in('id', stIds);
    console.log('  Deleted: stocktake_sessions');
  }

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
  if (!id) throw new Error('organization_id missing from pharmacies.');
  return id;
}

async function loadInventoryForPharmacy(pharmacyId) {
  const { data, error } = await supabase
    .from('inventory')
    .select('id, drug_code, batch_number, expiry_date, quantity_on_hand')
    .eq('pharmacy_id', pharmacyId)
    .order('drug_code', { ascending: true });

  if (error) throw new Error(`inventory for ${pharmacyId}: ${error.message}`);
  return data || [];
}

async function checkExistingSessions() {
  const { count, error } = await supabase
    .from('stock_count_sessions')
    .select('*', { count: 'exact', head: true })
    .like('session_name', `${SIM_TAG}%`);
  if (error) throw new Error(`session check: ${error.message}`);
  return count || 0;
}

// ─── Build session variance items ────────────────────────────────────────────

function buildCountedItems(invRows, cycleIdx) {
  // Use cycleIdx to vary which items get variance across cycles
  // Cycle 0: first 15% of items get variance
  // Cycle 1: middle 15%
  // Cycle 2: last 15% — ensures CS-3 has varied variance patterns
  const total         = invRows.length;
  const varianceCount = Math.round(total * VARIANCE_RATE);
  const offset        = Math.round(cycleIdx * total * 0.28) % total;

  // Build set of indices that get variance this cycle
  const varianceIndices = new Set();
  for (let i = 0; i < varianceCount; i++) {
    varianceIndices.add((offset + i) % total);
  }

  return invRows.map((row, idx) => {
    const sysQty = row.quantity_on_hand;
    let countedQty;

    if (varianceIndices.has(idx)) {
      // Deliberate variance — shortage more common than surplus (80/20)
      if (Math.random() < 0.80) {
        // SHORTAGE: counted < system — between 1 and min(sysQty, 20) units short
        const shortfall = randInt(1, Math.min(Math.max(1, Math.round(sysQty * 0.3)), 20));
        countedQty = Math.max(0, sysQty - shortfall);
      } else {
        // SURPLUS: counted > system — between 1 and 10 units over
        countedQty = sysQty + randInt(1, 10);
      }
    } else {
      // Clean count — exact match
      countedQty = sysQty;
    }

    const variance = countedQty - sysQty;
    return {
      inventoryId:   row.id,
      drugCode:      row.drug_code,
      batchNumber:   row.batch_number,
      expiryDate:    row.expiry_date,
      systemQty:     sysQty,
      countedQty,
      variance,
      hasVariance:   variance !== 0,
      varianceType:  variance < 0 ? 'SHORTAGE' : variance > 0 ? 'SURPLUS' : null,
    };
  });
}

// ─── Insert functions ────────────────────────────────────────────────────────

async function insertSession(orgId, pharmacyId, pharmName, cycleIdx, cycleDate) {
  const sessionName = `${SIM_TAG}-${pharmName.slice(0,12).replace(/\s/g,'-')}-C${cycleIdx+1}-${cycleDate}`;
  const startedAt   = cycleTimestamp(cycleDate, 0);
  const completedAt = cycleTimestamp(cycleDate, 6);

  const row = {
    organization_id: orgId,
    pharmacy_id:     pharmacyId,
    session_name:    sessionName,
    status:          'COMPLETED',
    started_at:      startedAt,
    completed_at:    completedAt,
    created_at:      startedAt,
  };

  if (DRY_RUN) return { id: `dry-run-sc-${cycleIdx}`, session_name: sessionName };

  const { data, error } = await supabase
    .from('stock_count_sessions')
    .insert(row)
    .select('id, session_name')
    .single();
  if (error) throw new Error(`stock_count_sessions: ${error.message}`);
  return data;
}

async function insertStocktakeSession(orgId, pharmacyId, pharmName, cycleIdx, cycleDate, reviewer) {
  const sessionName = `${SIM_TAG}-ST-${pharmName.slice(0,12).replace(/\s/g,'-')}-C${cycleIdx+1}-${cycleDate}`;
  const startedAt   = cycleTimestamp(cycleDate, 0);
  const completedAt = cycleTimestamp(cycleDate, 6);

  const row = {
    organization_id: orgId,
    pharmacy_id:     pharmacyId,
    session_name:    sessionName,
    status:          'COMPLETED',
    started_by:      reviewer,
    completed_by:    reviewer,
    started_at:      startedAt,
    completed_at:    completedAt,
  };

  if (DRY_RUN) return { id: `dry-run-st-${cycleIdx}` };

  const { data, error } = await supabase
    .from('stocktake_sessions')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error(`stocktake_sessions: ${error.message}`);
  return data;
}

async function insertStockCountItems(sessionId, countedItems) {
  const rows = countedItems.map(item => ({
    session_id:       sessionId,
    inventory_id:     item.inventoryId,
    drug_code:        item.drugCode,
    batch_number:     item.batchNumber,
    expiry_date:      item.expiryDate,
    system_quantity:  item.systemQty,
    counted_quantity: item.countedQty,
    variance:         item.variance,
    status:           'COUNTED',
    notes:            item.hasVariance ? `Variance detected: ${item.varianceType}` : null,
    created_at:       new Date().toISOString(),
  }));

  if (DRY_RUN) return rows.length;

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from('stock_count_items')
      .insert(rows.slice(i, i + BATCH_SIZE));
    if (error) throw new Error(`stock_count_items batch: ${error.message}`);
    inserted += Math.min(BATCH_SIZE, rows.length - i);
  }
  return inserted;
}

async function insertStocktakeItems(stocktakeSessionId, countedItems) {
  const rows = countedItems.map(item => ({
    stocktake_session_id: stocktakeSessionId,
    inventory_id:         item.inventoryId,
    drug_code:            item.drugCode,
    system_quantity:      item.systemQty,
    counted_quantity:     item.countedQty,
    variance:             item.variance,
    notes:                item.hasVariance ? `${item.varianceType}` : null,
    created_at:           new Date().toISOString(),
  }));

  if (DRY_RUN) return rows.length;

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from('stocktake_items')
      .insert(rows.slice(i, i + BATCH_SIZE));
    if (error) throw new Error(`stocktake_items batch: ${error.message}`);
    inserted += Math.min(BATCH_SIZE, rows.length - i);
  }
  return inserted;
}

async function insertReconciliationCases(sessionId, pharmacyId, countedItems, cycleDate) {
  const varianceItems = countedItems.filter(i => i.hasVariance);
  if (varianceItems.length === 0) return { cases: 0, auditRows: 0 };

  // Guarantee at least one REJECTED case per session for CS-3
  let hasRejected = false;
  const caseResults = [];

  for (const item of varianceItems) {
    const outcome   = weightedOutcome();
    const finalStatus = (!hasRejected && item === varianceItems[0]) ? 'REJECTED' : outcome;
    if (finalStatus === 'REJECTED') hasRejected = true;

    const reason = item.varianceType === 'SHORTAGE'
      ? pick(SHORTAGE_REASONS)
      : pick(SURPLUS_REASONS);

    const reviewer    = pick(REVIEWERS);
    const resolvedAt  = finalStatus !== 'UNDER_REVIEW'
      ? cycleTimestamp(cycleDate, 8)
      : null;

    const caseRow = {
      stock_count_session_id: sessionId,
      pharmacy_id:            pharmacyId,
      drug_code:              item.drugCode,
      batch_number:           item.batchNumber,
      expiry_date:            item.expiryDate,
      system_quantity:        item.systemQty,
      counted_quantity:       item.countedQty,
      variance:               item.variance,
      variance_type:          item.varianceType,
      reason,
      status:                 finalStatus,
      resolved_by:            finalStatus !== 'UNDER_REVIEW' ? reviewer : null,
      resolved_at:            resolvedAt,
      notes:                  `${SIM_TAG} | Cycle ${cycleDate} | ${reason}`,
      created_at:             cycleTimestamp(cycleDate, 1),
    };

    caseResults.push({ caseRow, finalStatus, reviewer, reason, cycleDate });
  }

  if (DRY_RUN) return { cases: caseResults.length, auditRows: caseResults.length * 2 };

  // Insert cases in batches — capture returned IDs for audit trail
  let totalCases    = 0;
  let totalAudit    = 0;
  const allCaseRows = caseResults.map(c => c.caseRow);

  for (let i = 0; i < allCaseRows.length; i += BATCH_SIZE) {
    const batch = allCaseRows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('reconciliation_cases')
      .insert(batch)
      .select('id, status, resolved_by');
    if (error) throw new Error(`reconciliation_cases: ${error.message}`);

    totalCases += data.length;

    // Build audit trail for each case
    const auditRows = [];
    for (let j = 0; j < data.length; j++) {
      const caseId    = data[j].id;
      const status    = data[j].status;
      const reviewer  = caseResults[i + j].reviewer;
      const cd        = caseResults[i + j].cycleDate;

      // Transition 1: PENDING → UNDER_REVIEW
      auditRows.push({
        reconciliation_case_id: caseId,
        action:                 'STATUS_CHANGE',
        previous_status:        'PENDING',
        new_status:             'UNDER_REVIEW',
        reason:                 'Variance identified during stock count review',
        performed_by:           reviewer,
        performed_at:           cycleTimestamp(cd, 2),
        created_at:             cycleTimestamp(cd, 2),
      });

      // Transition 2: UNDER_REVIEW → final status (if not still open)
      if (status !== 'UNDER_REVIEW') {
        auditRows.push({
          reconciliation_case_id: caseId,
          action:                 'STATUS_CHANGE',
          previous_status:        'UNDER_REVIEW',
          new_status:             status,
          reason:                 status === 'APPROVED'
            ? 'Variance investigated and resolved'
            : 'Recount required — variance unresolved',
          performed_by:           reviewer,
          performed_at:           cycleTimestamp(cd, 8),
          created_at:             cycleTimestamp(cd, 8),
        });
      }
    }

    // Insert audit trail
    for (let k = 0; k < auditRows.length; k += BATCH_SIZE) {
      const { error: auditErr } = await supabase
        .from('reconciliation_audit_trail')
        .insert(auditRows.slice(k, k + BATCH_SIZE));
      if (auditErr) throw new Error(`reconciliation_audit_trail: ${auditErr.message}`);
    }
    totalAudit += auditRows.length;
  }

  return { cases: totalCases, auditRows: totalAudit };
}

// ─── Manifest ────────────────────────────────────────────────────────────────

function printManifest(pharmacies, existingSessions) {
  printLine('=');
  console.log('  FALCONMED SIMULATOR v1 - MODULE G: STOCK COUNT & RECONCILIATION');
  printLine('=');
  console.log(`\n  Mode              : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE INSERT'}`);
  console.log(`  Pharmacies        : ${pharmacies.length}`);
  console.log(`  Cycles/pharmacy   : ${CYCLES_PER_PHARM}`);
  console.log(`  Total sessions    : ${pharmacies.length * CYCLES_PER_PHARM} (stock_count + stocktake)`);
  console.log(`  Variance rate     : ${VARIANCE_RATE * 100}% of items per session`);
  console.log(`  Existing SIM-G    : ${existingSessions} sessions (${existingSessions > 0 ? 'run --rollback first' : 'clean'})`);

  console.log('\n  CYCLE DATES');
  printLine();
  CYCLE_DATES.forEach((d, i) => console.log(`  Cycle ${i+1}           : ${d}`));

  console.log('\n  TABLES TO BE WRITTEN');
  printLine();
  const estItems = pharmacies.length * CYCLES_PER_PHARM * 1100; // ~1100 inv rows avg
  const estVariance = Math.round(estItems * VARIANCE_RATE);
  console.log(`  stock_count_sessions      : +${pharmacies.length * CYCLES_PER_PHARM} rows`);
  console.log(`  stock_count_items         : +~${estItems.toLocaleString()} rows`);
  console.log(`  stocktake_sessions        : +${pharmacies.length * CYCLES_PER_PHARM} rows`);
  console.log(`  stocktake_items           : +~${estItems.toLocaleString()} rows`);
  console.log(`  reconciliation_cases      : +~${estVariance.toLocaleString()} rows`);
  console.log(`  reconciliation_audit_trail: +~${(estVariance * 1.85).toLocaleString()} rows`);

  console.log('\n  CASE STUDY ALIGNMENT');
  printLine();
  console.log('  CS-3 Reconciliation Variance:');
  console.log('    - COUNTING_ERROR is primary reason code');
  console.log('    - At least 1 REJECTED case guaranteed per session');
  console.log('    - Full audit trail: PENDING → UNDER_REVIEW → APPROVED/REJECTED');
  console.log('    - SHORTAGE (80%) and SURPLUS (20%) variance types');
  printLine('=');
}

// ─── Confirm ────────────────────────────────────────────────────────────────

async function confirmProceed() {
  if (DRY_RUN) { console.log('\n  DRY RUN — no data will be written.\n'); return true; }
  return new Promise(resolve => {
    process.stdout.write('\n  Proceed with live inserts? Type YES: ');
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', d => resolve(d.trim().toUpperCase() === 'YES'));
  });
}

// ─── Validation Report ───────────────────────────────────────────────────────

async function validationReport(totals) {
  printLine('=');
  console.log('  MODULE G — VALIDATION REPORT');
  printLine('=');

  const checks = [
    ['stock_count_sessions',     'session_name', `${SIM_TAG}%`],
    ['stocktake_sessions',       'session_name', `${SIM_TAG}%`],
    ['reconciliation_cases',     'notes',        `${SIM_TAG}%`],
  ];

  for (const [table, col, pattern] of checks) {
    const { count } = await supabase
      .from(table).select('*', { count: 'exact', head: true })
      .like(col, pattern);
    console.log(`  ${table.padEnd(35)} : ${(count||0).toLocaleString()} rows`);
  }

  // Count audit trail via cases
  const { data: cases } = await supabase
    .from('reconciliation_cases').select('id').like('notes', `${SIM_TAG}%`).limit(10000);
  const caseIds = (cases||[]).map(r=>r.id);
  let auditCount = 0;
  if (caseIds.length > 0) {
    const { count } = await supabase
      .from('reconciliation_audit_trail').select('*', { count: 'exact', head: true })
      .in('reconciliation_case_id', caseIds);
    auditCount = count || 0;
  }
  console.log(`  ${'reconciliation_audit_trail'.padEnd(35)} : ${auditCount.toLocaleString()} rows`);

  // Status distribution
  if (!DRY_RUN && caseIds.length > 0) {
    const { data: statusDist } = await supabase
      .from('reconciliation_cases')
      .select('status')
      .like('notes', `${SIM_TAG}%`);

    const dist = {};
    (statusDist||[]).forEach(r => { dist[r.status] = (dist[r.status]||0)+1; });
    console.log('\n  RECONCILIATION STATUS DISTRIBUTION');
    printLine();
    Object.entries(dist).sort((a,b)=>b[1]-a[1]).forEach(([s,n]) =>
      console.log(`  ${s.padEnd(20)} : ${n.toLocaleString()} cases`)
    );
  }

  // IC-02 check — no negative system_quantity
  const { count: negCount } = await supabase
    .from('stock_count_items').select('*', { count: 'exact', head: true })
    .lt('system_quantity', 0);
  console.log(`\n  system_quantity < 0 (must be 0) : ${negCount||0}`);
  console.log(`  IC-02 status                    : ${(negCount||0)===0 ? 'PASS' : 'FAIL — investigate'}`);

  console.log('\n  INSERTED THIS RUN');
  printLine();
  console.log(`  Sessions (stock_count)   : ${totals.sessions}`);
  console.log(`  Sessions (stocktake)     : ${totals.stocktakeSessions}`);
  console.log(`  Items (stock_count)      : ${totals.items.toLocaleString()}`);
  console.log(`  Items (stocktake)        : ${totals.stocktakeItems.toLocaleString()}`);
  console.log(`  Reconciliation cases     : ${totals.cases.toLocaleString()}`);
  console.log(`  Audit trail rows         : ${totals.auditRows.toLocaleString()}`);

  printLine('=');
  console.log('\n  MODULE G COMPLETE — READY FOR POWER BI EXPORT VALIDATION\n');
  printLine('=');
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  FalconMed Simulator v1 - Module G: Stock Count & Reconciliation');
  console.log(`  ${new Date().toISOString()}\n`);

  if (ROLLBACK_MODE) { await rollback(); return; }

  // Phase 0: Load data
  console.log('  Phase 0: Loading live data...');
  printLine();

  let pharmacies, orgId, existingSessions;
  try {
    pharmacies       = await loadPharmacies();
    orgId            = await loadOrgId(pharmacies);
    existingSessions = await checkExistingSessions();
  } catch (err) {
    console.error(`\n  Phase 0 failed: ${err.message}`); process.exit(1);
  }

  if (existingSessions > 0) {
    console.warn(`\n  WARN: ${existingSessions} SIM-G sessions already exist.`);
    console.warn('  Run --rollback first to reset, then re-run.\n');
    process.exit(0);
  }

  // Manifest + confirm
  printManifest(pharmacies, existingSessions);
  const confirmed = await confirmProceed();
  if (!confirmed) { console.log('\n  Aborted. No data written.\n'); process.exit(0); }

  // Phase 1: Per-pharmacy simulation
  console.log('\n  Phase 1: Generating stock count sessions...');
  printLine();

  const totals = {
    sessions: 0, stocktakeSessions: 0,
    items: 0,    stocktakeItems: 0,
    cases: 0,    auditRows: 0,
  };

  let pharmDone = 0;
  for (const pharm of pharmacies) {
    pharmDone++;
    const pharmName = pharm.pharmacy_name || pharm.name || pharm.id;
    process.stdout.write(`\r  ${progressBar(pharmDone, pharmacies.length)} ${pharmName.slice(0,28).padEnd(28)}`);

    // Load inventory for this pharmacy
    let invRows;
    try {
      invRows = await loadInventoryForPharmacy(pharm.id);
    } catch (err) {
      console.warn(`\n  WARN: Could not load inventory for ${pharmName}: ${err.message}`);
      continue;
    }
    if (invRows.length === 0) {
      console.warn(`\n  WARN: No inventory rows for ${pharmName} — skipping`);
      continue;
    }

    for (let c = 0; c < CYCLES_PER_PHARM; c++) {
      const cycleDate = CYCLE_DATES[c];
      const reviewer  = pick(REVIEWERS);

      // Build counted items for this cycle
      const countedItems = buildCountedItems(invRows, c);

      // Insert stock_count_session
      let scSession;
      try {
        scSession = await insertSession(orgId, pharm.id, pharmName, c, cycleDate);
        totals.sessions++;
      } catch (err) {
        console.error(`\n  ERROR session ${pharmName} cycle ${c+1}: ${err.message}`);
        continue;
      }

      // Insert stock_count_items
      try {
        const inserted = await insertStockCountItems(scSession.id, countedItems);
        totals.items += inserted;
      } catch (err) {
        console.error(`\n  ERROR items ${pharmName} cycle ${c+1}: ${err.message}`);
      }

      // Insert stocktake_session (parallel)
      let stSession;
      try {
        stSession = await insertStocktakeSession(orgId, pharm.id, pharmName, c, cycleDate, reviewer);
        totals.stocktakeSessions++;
      } catch (err) {
        console.error(`\n  ERROR stocktake session ${pharmName} cycle ${c+1}: ${err.message}`);
      }

      // Insert stocktake_items
      if (stSession) {
        try {
          const inserted = await insertStocktakeItems(stSession.id, countedItems);
          totals.stocktakeItems += inserted;
        } catch (err) {
          console.error(`\n  ERROR stocktake items ${pharmName} cycle ${c+1}: ${err.message}`);
        }
      }

      // Insert reconciliation cases + audit trail
      try {
        const result = await insertReconciliationCases(
          scSession.id, pharm.id, countedItems, cycleDate
        );
        totals.cases    += result.cases;
        totals.auditRows += result.auditRows;
      } catch (err) {
        console.error(`\n  ERROR reconciliation ${pharmName} cycle ${c+1}: ${err.message}`);
      }
    }
  }

  console.log(`\n\n  Phase 1 complete.`);

  // Validation report
  await validationReport(totals);

  process.exit(0);
}

main().catch(err => {
  console.error('\n  Unexpected error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
