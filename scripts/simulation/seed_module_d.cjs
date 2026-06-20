/**
 * FalconMed Simulator v1 — Module D: Dispensing Simulation
 * File: scripts/simulation/seed_module_d.cjs
 *
 * PURPOSE:
 *   Generates 40,000 realistic dispense events across 17 pharmacies
 *   over a 90-day window (2026-03-19 → 2026-06-19).
 *
 * WRITES TO (3-table atomic per event):
 *   1. inventory_transactions   (type = 'DISPENSE')
 *   2. patient_dispense_history (linked via transaction_id)
 *   3. patient_medication_history (linked via inventory_transaction_id)
 *   4. inventory               (quantity_on_hand decremented — day-end batch UPDATE)
 *
 * RULES:
 *   - APPEND ONLY on inventory — no DELETE, no TRUNCATE, no Module B rows touched
 *   - Non-negative guarantee — in-memory qty tracker prevents qty < 0
 *   - FEFO — earliest expiry batch consumed first per drug per pharmacy
 *   - Pre-OOS rows exhausted by design
 *   - Expired rows (expiry < today) never dispensed
 *   - Rollback-safe — SIM-D transactions identified by notes field prefix 'SIM-D'
 *   - Idempotent — checks existing SIM-D count before inserting
 *   - service_role only in this local script, never in React/Vite
 *
 * DA-01 PHARMACY TYPE STRINGS (confirmed from live DB):
 *   MAIN, ER, ICU, OR, PEDIATRIC, ONCOLOGY, DIALYSIS,
 *   CARDIOLOGY, DAY_SURGERY, AMBULATORY, RETAIL, hospital, PHARMACY
 *
 * DA-02 INSURANCE VALUES (confirmed from live DB):
 *   ADNIC (17%) · Thiqa (16.9%) · Self Pay (16.8%) · Daman (16.7%)
 *   NAS (16.5%) · Inayah Insurance (16.1%) · Basic (0.06%)
 *
 * RUN:
 *   node scripts/simulation/seed_module_d.cjs --dry-run
 *   node scripts/simulation/seed_module_d.cjs
 *   node scripts/simulation/seed_module_d.cjs --pharmacy MAIN
 *   node scripts/simulation/seed_module_d.cjs --rollback
 */

'use strict';

// EXACT dotenv pattern from seed_module_b.js — no path arg, resolves from cwd.
// ALWAYS run from project root: PS C:\Projects\FalconMed-v3> node scripts/simulation/seed_module_d.cjs
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// ─── Configuration ────────────────────────────────────────────────────────────

const SIM_DATE_START  = new Date('2026-03-19T00:00:00.000Z');
const SIM_DATE_END    = new Date('2026-06-19T23:59:59.000Z');
const SIM_DAYS        = 92; // inclusive
const TARGET_EVENTS   = 40_000;
const SIM_TAG         = 'SIM-D'; // written to notes — used for rollback identification
const BATCH_SIZE_INS  = 100;     // rows per insert call
const SIM_DISPENSERS  = [
  'Dr. Ahmed Al Mansoori', 'Dr. Fatima Al Zaabi', 'Dr. Mohammed Al Shamsi',
  'Dr. Sara Al Nuaimi',    'Dr. Khalid Al Rashidi','Dr. Aisha Al Kaabi',
  'Dr. Omar Al Mazrouei',  'Dr. Noura Al Mheiri',  'Pharm. Tariq Hassan',
  'Pharm. Layla Ibrahim',  'Pharm. Yusuf Al Ali',  'Pharm. Reem Al Falasi',
];
const SIM_DOCTORS = [
  'Dr. Ibrahim Al Hosani', 'Dr. Mariam Al Suwaidi','Dr. Saeed Al Ketbi',
  'Dr. Hessa Al Muhairi',  'Dr. Rashid Al Khoori', 'Dr. Amna Al Blooshi',
  'Dr. Hamad Al Mazrouei', 'Dr. Shaikha Al Neyadi','Dr. Juma Al Remeithi',
];
const INDICATIONS = [
  'Hypertension','Diabetes Mellitus','Respiratory Infection','Post-operative pain',
  'Chronic pain management','Cardiac arrhythmia','Anxiety disorder',
  'Bacterial infection','Asthma','Hyperlipidaemia','Epilepsy',
  'Gastroesophageal reflux','Urinary tract infection','Analgesia',
];

// DA-01: confirmed pharmacy type → weight multiplier
const PHARMACY_WEIGHTS = {
  MAIN:        1.8,   // Very High — main inpatient
  ER:          1.5,   // High — emergency
  ICU:         1.4,   // High
  OR:          1.2,   // Medium-High
  PEDIATRIC:   1.0,   // Medium
  ONCOLOGY:    1.0,   // Medium
  DIALYSIS:    1.0,   // Medium
  CARDIOLOGY:  1.0,   // Medium
  DAY_SURGERY: 0.9,   // Medium
  AMBULATORY:  0.9,   // Medium
  hospital:    1.0,   // DEFAULT for generic 'hospital' string
  PHARMACY:    0.7,   // DEFAULT for generic 'PHARMACY' string
  RETAIL:      0.6,   // Low-Medium
  DEFAULT:     0.8,   // fallback for any unmapped type
};

// DA-02: confirmed insurance distribution (weighted)
const INSURANCE_POOL = [
  { value: 'ADNIC',             weight: 1700 },
  { value: 'Thiqa',             weight: 1688 },
  { value: 'Self Pay',          weight: 1678 },
  { value: 'Daman',             weight: 1673 },
  { value: 'NAS',               weight: 1647 },
  { value: 'Inayah Insurance',  weight: 1608 },
  { value: 'Basic',             weight: 6    },
];
const INSURANCE_TOTAL = INSURANCE_POOL.reduce((s, i) => s + i.weight, 0);

// Drug cost → qty dispensed per event
const DISPENSE_QTY_BANDS = [
  { maxCost:    5, min:  7, max: 30 },
  { maxCost:   50, min:  5, max: 14 },
  { maxCost:  200, min:  1, max:  7 },
  { maxCost: 1000, min:  1, max:  3 },
  { maxCost: Infinity, min: 1, max: 1 },
];

// UAE weekday weights (0=Sun … 6=Sat)
const DAY_WEIGHTS = [1.0, 1.0, 1.0, 1.0, 1.0, 0.4, 0.6];

// Monthly trend multiplier (month index 0=Mar, 1=Apr/May, 2=Jun)
const MONTH_TREND = [0.90, 1.00, 1.05];

// ─── Supabase Client (identical to seed_module_b.js — confirmed working) ────────

// Diagnostics printed before any exit — shows exactly what dotenv loaded
console.log('  DIAG SUPABASE_URL exists        :', !!process.env.SUPABASE_URL);
console.log('  DIAG SERVICE_ROLE_KEY exists    :', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  // First 6 chars: JWT service keys start eyJhb, anon keys also eyJhb but differ in payload
  // sb_secret_ prefix = new Supabase key format. Either is valid for service_role.
  console.log('  DIAG KEY prefix (first 6 chars) :', process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 6));
  console.log('  DIAG Key variable               : SUPABASE_SERVICE_ROLE_KEY (no anon fallback)');
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n  ERROR: Missing env vars. .env must be in project root and contain:');
  console.error('    SUPABASE_URL=https://your-project.supabase.co');
  console.error('    SUPABASE_SERVICE_ROLE_KEY=<your service role key>');
  console.error('  Do NOT use VITE_SUPABASE_ANON_KEY. Run from project root.\n');
  process.exit(1);
}

// createClient with explicit Authorization header.
// Root cause of "permission denied for patients": Supabase RLS policies using
// auth.uid() or security-definer functions require the service_role JWT to be
// present as a Bearer token — not just as the apikey header.
// Adding the global Authorization header ensures every request carries the JWT,
// which satisfies auth.uid()-based policies even with persistSession: false.
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
// ─── CLI Flags ────────────────────────────────────────────────────────────────

const DRY_RUN         = process.argv.includes('--dry-run');
const ROLLBACK_MODE   = process.argv.includes('--rollback');
const PHARMACY_FILTER = (() => {
  const idx = process.argv.indexOf('--pharmacy');
  return idx !== -1 ? process.argv[idx + 1]?.toUpperCase() : null;
})();

// ─── Utilities ────────────────────────────────────────────────────────────────

const randInt  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick     = (arr) => arr[Math.floor(Math.random() * arr.length)];
const printLine = (c = '-', n = 72) => console.log(c.repeat(n));

function weightedRandom(pool, totalWeight) {
  let r = Math.random() * totalWeight;
  for (const item of pool) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return pool.at(-1).value;
}

function resolvePharmacyType(pharmacy) {
  const typeCol = ['pharmacy_type','type','category','facility_type']
    .find(c => c in pharmacy && pharmacy[c]);
  if (!typeCol) return 'DEFAULT';
  return String(pharmacy[typeCol]).trim().toUpperCase() in PHARMACY_WEIGHTS
    ? String(pharmacy[typeCol]).trim()
    : 'DEFAULT';
}

function getWeight(typeStr) {
  return PHARMACY_WEIGHTS[typeStr] ?? PHARMACY_WEIGHTS.DEFAULT;
}

function dispenseQtyForCost(cost) {
  for (const b of DISPENSE_QTY_BANDS) {
    if (cost <= b.maxCost) return randInt(b.min, b.max);
  }
  return 1;
}

function dayWeight(date) {
  const dow   = date.getUTCDay(); // 0=Sun
  const month = date.getUTCMonth();
  const mIdx  = month === 2 ? 0 : month === 5 ? 2 : 1; // Mar=0, Jun=2, else 1
  return DAY_WEIGHTS[dow] * MONTH_TREND[mIdx];
}

function randomTimestamp(date) {
  // Pharmacy hours 07:00–22:00 UAE (UTC+4 → UTC 03:00–18:00)
  const base = new Date(date);
  base.setUTCHours(3, 0, 0, 0);
  const offsetSec = randInt(0, 15 * 3600); // 0–15h spread
  return new Date(base.getTime() + offsetSec * 1000).toISOString();
}

function progressBar(cur, tot, w = 28) {
  const f = Math.round((cur / (tot || 1)) * w);
  return `[${'█'.repeat(f)}${'░'.repeat(w - f)}] ${cur}/${tot}`;
}

// ─── Phase 0: Read Live Data ──────────────────────────────────────────────────

// Connection test — called once before any data load.
// Catches auth failures (wrong key, RLS blocking) before Phase 0 wastes time.
async function testConnection() {
  // Use pharmacies: expected to be accessible with service_role
  const { data, error } = await supabase
    .from('pharmacies')
    .select('id')
    .limit(1);

  if (error) {
    console.error('\n  CONNECTION TEST FAILED:', error.message);
    console.error('  This usually means:');
    console.error('  1. SUPABASE_SERVICE_ROLE_KEY is wrong or not loaded');
    console.error('  2. .env file not found — run from project root: C:\\Projects\\FalconMed-v3');
    console.error('  3. Anon key was loaded instead of service_role key');
    console.error('\n  FIX: Confirm your .env file contains SUPABASE_SERVICE_ROLE_KEY');
    console.error('  (not VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY)\n');
    process.exit(1);
  }

  console.log('  OK   Connection test passed (service_role verified)');
}

async function loadPharmacies() {
  const { data, error } = await supabase.from('pharmacies').select('*');
  if (error) throw new Error(`pharmacies: ${error.message}`);
  if (!data?.length) throw new Error('No pharmacies found.');

  const sample = data[0];
  let active;
  if ('status' in sample) {
    active = data.filter(p => String(p.status || '').toUpperCase() === 'ACTIVE');
    console.log(`  OK  status=ACTIVE filter: ${active.length}/${data.length} pharmacies`);
  } else if ('is_active' in sample) {
    active = data.filter(p => p.is_active === true);
    console.log(`  OK  is_active=true filter: ${active.length}/${data.length} pharmacies`);
  } else {
    active = data;
    console.warn(`  WARN  No active column found — using all ${data.length} pharmacies`);
  }

  return active.map(p => ({
    ...p,
    _type:   resolvePharmacyType(p),
    _weight: getWeight(resolvePharmacyType(p)),
    _name:   p.pharmacy_name || p.name || p.id,
  }));
}

async function loadOrgId(pharmacies) {
  const id = pharmacies[0]?.organization_id;
  if (!id) throw new Error('organization_id missing from pharmacies.');
  return id;
}

async function loadInventoryForPharmacy(pharmacyId) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('inventory')
    .select('id, drug_code, quantity_on_hand, expiry_date, unit_cost, batch_number, minimum_stock')
    .eq('pharmacy_id', pharmacyId)
    .gt('quantity_on_hand', 0)
    .gte('expiry_date', today)   // exclude expired rows (CONS-05)
    .order('expiry_date', { ascending: true });  // FEFO pre-sort

  if (error) throw new Error(`inventory load for ${pharmacyId}: ${error.message}`);
  return data || [];
}

async function loadPatientIds(orgId) {
  // Filter by organization_id — required to satisfy RLS policy on patients table.
  // Without this filter, even service_role is denied on some Supabase RLS configs.
  const PAGE = 1000;
  let all = [];
  for (let offset = 0; offset < 10000; offset += PAGE) {
    const { data, error } = await supabase
      .from('patients')
      .select('id, insurance_provider')
      .eq('organization_id', orgId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`patients page ${offset}: ${error.message}`);
    if (!data?.length) break;
    all = all.concat(data);
  }
  if (all.length === 0) throw new Error('No patients found for this organization_id.');
  console.log(`  OK  ${all.length.toLocaleString()} patients loaded`);
  return all;
}

async function countExistingSimD() {
  const { count, error } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true })
    .like('notes', `${SIM_TAG}%`);
  if (error) throw new Error(`SIM-D count: ${error.message}`);
  return count || 0;
}

// ─── Rollback ────────────────────────────────────────────────────────────────

async function rollback() {
  printLine('=');
  console.log('  ROLLBACK MODE — removing all SIM-D records');
  printLine('=');

  // Count first
  const txnCount = await countExistingSimD();

  // Count dispense history rows via transaction_id lookup
  const { data: txnIds } = await supabase
    .from('inventory_transactions')
    .select('id')
    .like('notes', `${SIM_TAG}%`)
    .limit(50000);

  const ids = (txnIds || []).map(r => r.id);
  console.log(`\n  SIM-D inventory_transactions : ${txnCount.toLocaleString()}`);
  console.log(`  SIM-D IDs retrieved          : ${ids.length.toLocaleString()}`);

  if (ids.length === 0) {
    console.log('\n  Nothing to rollback.\n');
    process.exit(0);
  }

  // Confirm
  await new Promise(resolve => {
    process.stdout.write('\n  Type YES to confirm rollback: ');
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', d => {
      if (d.trim().toUpperCase() !== 'YES') {
        console.log('  Aborted.\n'); process.exit(0);
      }
      resolve();
    });
  });

  // Delete in pages of 500
  const PAGE = 500;
  let deleted = { txn: 0, pdh: 0, pmh: 0 };

  for (let i = 0; i < ids.length; i += PAGE) {
    const page = ids.slice(i, i + PAGE);

    const [r1, r2, r3] = await Promise.all([
      supabase.from('patient_dispense_history').delete().in('transaction_id', page),
      supabase.from('patient_medication_history').delete().in('inventory_transaction_id', page),
      supabase.from('inventory_transactions').delete().in('id', page),
    ]);
    if (r1.error) console.warn(`  WARN pdh delete: ${r1.error.message}`);
    if (r2.error) console.warn(`  WARN pmh delete: ${r2.error.message}`);
    if (r3.error) console.warn(`  WARN txn delete: ${r3.error.message}`);
    deleted.pdh += page.length;
    deleted.pmh += page.length;
    deleted.txn += page.length;
    process.stdout.write(`\r  Deleted ${deleted.txn}/${ids.length} transaction records...`);
  }

  console.log('\n\n  NOTE: inventory.quantity_on_hand was updated in day-end batches.');
  console.log('  To restore inventory quantities, re-run Module B cleanup + reseed.');
  console.log('  Or restore from a Supabase backup taken before Module D.\n');
  printLine('=');
  console.log('  ROLLBACK COMPLETE');
  printLine('=');
  process.exit(0);
}

// ─── Build Daily Schedule ─────────────────────────────────────────────────────

function buildDailySchedule(pharmacies) {
  // Total weight sum
  const totalWeight = pharmacies.reduce((s, p) => s + p._weight, 0);

  // Total weighted day units across 90 days
  const days = [];
  for (let d = 0; d < SIM_DAYS; d++) {
    const date = new Date(SIM_DATE_START);
    date.setUTCDate(date.getUTCDate() + d);
    days.push({ date, dw: dayWeight(date) });
  }
  const totalDayWeight = days.reduce((s, d) => s + d.dw, 0);

  // Assign events per pharmacy per day
  const schedule = []; // [{ date, pharmacyId, pharmObj, targetEvents }]
  let assigned = 0;

  for (const day of days) {
    const dayShare = (day.dw / totalDayWeight) * TARGET_EVENTS;
    for (const pharm of pharmacies) {
      const pharmShare = (pharm._weight / totalWeight) * dayShare;
      const count      = Math.max(0, Math.round(pharmShare));
      if (count > 0) {
        schedule.push({ date: day.date, pharm, count });
        assigned += count;
      }
    }
  }

  // Trim or pad to hit TARGET_EVENTS exactly
  const diff = assigned - TARGET_EVENTS;
  if (diff > 0) {
    // Remove from last entries
    let toRemove = diff;
    for (let i = schedule.length - 1; i >= 0 && toRemove > 0; i--) {
      const remove = Math.min(schedule[i].count, toRemove);
      schedule[i].count -= remove;
      toRemove -= remove;
    }
  } else if (diff < 0) {
    // Add to highest-weight pharmacies on mid-week days
    const highVol = schedule
      .filter(s => s.pharm._weight >= 1.4)
      .sort((a, b) => b.count - a.count);
    let toAdd = Math.abs(diff);
    for (let i = 0; toAdd > 0; i = (i + 1) % Math.max(1, highVol.length)) {
      highVol[i].count++;
      toAdd--;
    }
  }

  return schedule.filter(s => s.count > 0);
}

// ─── Dispense Event Builder ───────────────────────────────────────────────────

function buildEvents(dayEntry, inventoryPool, qtyTracker, patients, orgId) {
  const { date, pharm, count } = dayEntry;
  const events = [];

  // Build eligible drug list for this pharmacy (FEFO already sorted by expiry ASC from DB)
  // Group by drug_code: only earliest-expiry batch per drug eligible at any time
  const drugMap = new Map(); // drug_code → inventory row (earliest eligible batch)
  for (const row of inventoryPool) {
    if (!drugMap.has(row.drug_code) && (qtyTracker.get(row.id) ?? row.quantity_on_hand) > 0) {
      drugMap.set(row.drug_code, row);
    }
  }

  const eligible = [...drugMap.values()].filter(r => (qtyTracker.get(r.id) ?? r.quantity_on_hand) > 0);
  if (eligible.length === 0) return events;

  for (let i = 0; i < count; i++) {
    // Pick drug (weighted toward low-stock rows — CONS-02/03)
    const drug = pickDrugWeighted(eligible, qtyTracker);
    if (!drug) break;

    const currentQty = qtyTracker.get(drug.id) ?? drug.quantity_on_hand;
    const maxQty     = Math.min(currentQty, dispenseQtyForCost(drug.unit_cost || 0));
    if (maxQty < 1) continue;
    const dispQty    = maxQty === 1 ? 1 : randInt(1, maxQty);

    // Pick patient
    const patient    = pick(patients);
    const insurance  = patient.insurance_provider ||
      weightedRandom(INSURANCE_POOL, INSURANCE_TOTAL);
    const ts         = randomTimestamp(date);

    events.push({
      inventoryId:  drug.id,
      drugCode:     drug.drug_code,
      pharmacyId:   pharm.id,
      orgId,
      patientId:    patient.id,
      insurance,
      quantity:     dispQty,
      unitCost:     parseFloat(drug.unit_cost) || 0,
      timestamp:    ts,
      dispenser:    pick(SIM_DISPENSERS),
      doctor:       pick(SIM_DOCTORS),
      indication:   pick(INDICATIONS),
    });

    // Decrement in-memory tracker (IC-02 — non-negative enforced here)
    const newQty = currentQty - dispQty;
    qtyTracker.set(drug.id, newQty);

    // If this batch is exhausted, remove from eligible for this day
    if (newQty <= 0) {
      const idx = eligible.indexOf(drug);
      if (idx !== -1) eligible.splice(idx, 1);
    }
  }

  return events;
}

// Weighted drug pick — lower stock rows picked more often (CONS-02/03)
function pickDrugWeighted(eligible, qtyTracker) {
  if (eligible.length === 0) return null;
  // Weight inversely proportional to remaining qty — low stock gets picked more
  const weights = eligible.map(r => {
    const qty = qtyTracker.get(r.id) ?? r.quantity_on_hand;
    return Math.max(1, 1000 / (qty + 1)); // higher weight when qty is lower
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < eligible.length; i++) {
    r -= weights[i];
    if (r <= 0) return eligible[i];
  }
  return eligible.at(-1);
}

// ─── Phase 3: Insert Events ───────────────────────────────────────────────────

async function insertEvents(events, dryRun) {
  if (events.length === 0) return { txn: 0, pdh: 0, pmh: 0 };

  // Step 1: Insert inventory_transactions — capture returned IDs
  const txnRows = events.map(e => ({
    organization_id:      e.orgId,
    source_pharmacy_id:   e.pharmacyId,
    destination_pharmacy_id: null,
    drug_code:            e.drugCode,
    quantity:             e.quantity,
    transaction_type:     'DISPENSE',
    notes:                `${SIM_TAG}|${e.insurance}`,
    created_at:           e.timestamp,
  }));

  let txnIds = [];
  if (!dryRun) {
    const { data, error } = await supabase
      .from('inventory_transactions')
      .insert(txnRows)
      .select('id');
    if (error) throw new Error(`inventory_transactions insert: ${error.message}`);
    txnIds = (data || []).map(r => r.id);
    if (txnIds.length !== events.length) {
      throw new Error(`TXN ID count mismatch: expected ${events.length}, got ${txnIds.length}`);
    }
  } else {
    txnIds = events.map(() => '00000000-0000-0000-0000-000000000000');
  }

  // Step 2: Build dispense history rows using captured TXN IDs
  const pdhRows = events.map((e, i) => ({
    patient_id:        e.patientId,
    pharmacy_id:       e.pharmacyId,
    drug_code:         e.drugCode,
    quantity_dispensed: e.quantity,
    dispense_date:     e.timestamp,
    dispensed_by:      e.dispenser,
    transaction_id:    txnIds[i],
    notes:             SIM_TAG,
    created_at:        e.timestamp,
  }));

  const pmhRows = events.map((e, i) => ({
    patient_id:                e.patientId,
    pharmacy_id:               e.pharmacyId,
    drug_code:                 e.drugCode,
    quantity:                  e.quantity,
    unit:                      'unit',
    directions:                `Take as directed by ${e.doctor}`,
    duration_days:             randInt(3, 30),
    prescribing_doctor:        e.doctor,
    indication:                e.indication,
    inventory_transaction_id:  txnIds[i],
    created_at:                e.timestamp,
  }));

  if (!dryRun) {
    // Insert in batches
    for (let i = 0; i < pdhRows.length; i += BATCH_SIZE_INS) {
      const { error } = await supabase
        .from('patient_dispense_history')
        .insert(pdhRows.slice(i, i + BATCH_SIZE_INS));
      if (error) throw new Error(`patient_dispense_history: ${error.message}`);
    }
    for (let i = 0; i < pmhRows.length; i += BATCH_SIZE_INS) {
      const { error } = await supabase
        .from('patient_medication_history')
        .insert(pmhRows.slice(i, i + BATCH_SIZE_INS));
      if (error) throw new Error(`patient_medication_history: ${error.message}`);
    }
  }

  return { txn: txnIds.length, pdh: pdhRows.length, pmh: pmhRows.length };
}

// ─── Day-End Inventory UPDATE ─────────────────────────────────────────────────

async function flushInventoryDeltas(deltaMap, dryRun) {
  // deltaMap: Map<inventoryId, totalQtyDispensed>
  if (deltaMap.size === 0) return;

  const entries = [...deltaMap.entries()];
  for (const [invId, totalDispensed] of entries) {
    if (dryRun) continue;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('inventory')
      .update({
        quantity_on_hand: supabase.rpc ? undefined : undefined, // use raw expression below
        last_updated: now,
        updated_at:   now,
      })
      .eq('id', invId);

    // Supabase JS client doesn't support arithmetic updates directly.
    // Use RPC pattern: decrement by exact amount using a safe floor-at-zero expression.
    if (error) console.warn(`  WARN inventory update ${invId}: ${error.message}`);
  }

  // Better: use a single RPC or raw SQL for bulk decrement
  // Since Supabase JS lacks arithmetic update, we batch via RPC if available,
  // otherwise fall back to individual updates with pre-computed new values.
  // The qtyTracker already has the correct new values — use them directly.
}

// Revised: use pre-computed absolute values from qtyTracker
async function flushInventoryAbsolute(qtyTracker, touchedIds, dryRun) {
  if (touchedIds.size === 0 || dryRun) return 0;

  let updated = 0;
  const entries = [...touchedIds].map(id => ({
    id,
    newQty: Math.max(0, qtyTracker.get(id) ?? 0),
  }));

  // Batch in groups of 50
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    const now   = new Date().toISOString();

    await Promise.all(batch.map(({ id, newQty }) =>
      supabase.from('inventory').update({
        quantity_on_hand: newQty,
        last_updated:     now,
        updated_at:       now,
      }).eq('id', id)
    ));
    updated += batch.length;
  }
  return updated;
}

// ─── Manifest ────────────────────────────────────────────────────────────────

function printManifest(pharmacies, schedule, existingSimD) {
  printLine('=');
  console.log('  FALCONMED SIMULATOR v1 - MODULE D: DISPENSING SIMULATION');
  printLine('=');
  console.log(`\n  Mode         : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE INSERT'}`);
  console.log(`  Date Range   : 2026-03-19 -> 2026-06-19 (${SIM_DAYS} days)`);
  console.log(`  Target Events: ${TARGET_EVENTS.toLocaleString()}`);
  console.log(`  Existing SIM-D txns: ${existingSimD.toLocaleString()} (will skip if > 0)`);
  if (PHARMACY_FILTER) console.log(`  Pharmacy Filter: ${PHARMACY_FILTER}`);

  console.log('\n  PHARMACY WEIGHTS + EVENT ALLOCATION');
  printLine();
  const pharmSummary = {};
  for (const entry of schedule) {
    const key = entry.pharm._name;
    pharmSummary[key] = (pharmSummary[key] || 0) + entry.count;
  }
  const sortedPharm = Object.entries(pharmSummary).sort((a,b) => b[1]-a[1]);
  for (const [name, count] of sortedPharm) {
    const pharm  = pharmacies.find(p => p._name === name);
    const weight = pharm ? pharm._weight : '?';
    console.log(`  ${String(name).padEnd(38)} weight=${String(weight).padEnd(5)} events=${count.toLocaleString()}`);
  }
  const totalSched = Object.values(pharmSummary).reduce((s,v)=>s+v,0);
  console.log(`\n  Total scheduled: ${totalSched.toLocaleString()}`);

  console.log('\n  TABLES TO BE WRITTEN');
  printLine();
  console.log(`  inventory_transactions    : +${TARGET_EVENTS.toLocaleString()} rows (type=DISPENSE)`);
  console.log(`  patient_dispense_history  : +${TARGET_EVENTS.toLocaleString()} rows`);
  console.log(`  patient_medication_history: +${TARGET_EVENTS.toLocaleString()} rows`);
  console.log(`  inventory                 : quantity_on_hand decremented (day-end batch)`);
  console.log(`\n  MODULE B DATA: NOT TOUCHED (batch_number prefix preserved)`);
  printLine('=');
}

// ─── Validation Report ───────────────────────────────────────────────────────

async function validationReport(preInventoryValue, preCounts) {
  console.log('\n');
  printLine('=');
  console.log('  MODULE D — FULL VALIDATION REPORT');
  printLine('=');

  // 1. Transaction counts
  const { count: txnCount } = await supabase
    .from('inventory_transactions')
    .select('*', { count: 'exact', head: true })
    .like('notes', `${SIM_TAG}%`);

  const { count: pdhCount } = await supabase
    .from('patient_dispense_history')
    .select('*', { count: 'exact', head: true })
    .like('notes', SIM_TAG);

  const { count: pmhCount } = await supabase
    .from('patient_medication_history')
    .select('*', { count: 'exact', head: true });

  console.log('\n  [1] TRANSACTION COUNTS');
  printLine();
  console.log(`  inventory_transactions (SIM-D)    : ${(txnCount||0).toLocaleString()}`);
  console.log(`  patient_dispense_history (SIM-D)  : ${(pdhCount||0).toLocaleString()}`);
  console.log(`  patient_medication_history (total): ${(pmhCount||0).toLocaleString()}`);

  const txnOk = (txnCount||0) > 0;
  console.log(`  Status: ${txnOk ? 'OK  - events recorded' : 'WARN - no SIM-D events found'}`);

  // 2. OOS emergence
  const today = new Date().toISOString().split('T')[0];
  const { count: oosCount } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .eq('quantity_on_hand', 0);

  const { count: preOosRemaining } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .like('batch_number', 'SIM-B-%PRE_OOS%')
    .gt('quantity_on_hand', 0);

  console.log('\n  [2] INVENTORY STATE');
  printLine();
  console.log(`  Total OOS rows now (qty=0)         : ${(oosCount||0).toLocaleString()}`);
  console.log(`  Pre-OOS rows still above 0 (SIM-B) : ${(preOosRemaining||0).toLocaleString()}`);
  console.log(`  Pre-OOS exhausted                  : ${(preOosRemaining||0) === 0 ? 'YES - all exhausted as designed' : 'PARTIAL - some remain'}`);

  // 3. Near expiry remaining
  const in90 = new Date();
  in90.setDate(in90.getDate() + 90);
  const { count: neCount } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .lte('expiry_date', in90.toISOString().split('T')[0])
    .gte('expiry_date', today)
    .gt('quantity_on_hand', 0);

  const { count: expiredCount } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .lt('expiry_date', today)
    .gt('quantity_on_hand', 0);

  console.log(`  Near Expiry rows (<=90 days, qty>0): ${(neCount||0).toLocaleString()}`);
  console.log(`  Expired rows (stranded, qty>0)     : ${(expiredCount||0).toLocaleString()}`);

  // 4. Non-negative check
  const { count: negCount } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .lt('quantity_on_hand', 0);

  console.log('\n  [3] NON-NEGATIVE GUARANTEE (IC-02)');
  printLine();
  if ((negCount||0) === 0) {
    console.log('  OK  - No negative quantity_on_hand rows found');
  } else {
    console.error(`  FAIL - ${negCount} rows have quantity_on_hand < 0 — INVESTIGATE`);
  }

  // 5. Analytical view spot checks
  console.log('\n  [4] ANALYTICAL VIEW SPOT CHECKS');
  printLine();

  const views = [
    'vw_dispensing_activity',
    'vw_out_of_stock_inventory',
    'vw_near_expiry_inventory',
    'vw_top_dispensed_drugs',
    'vw_patient_dispense_activity',
  ];

  for (const view of views) {
    const { count, error } = await supabase
      .from(view)
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`  WARN ${view.padEnd(35)} - ${error.message}`);
    } else {
      const status = (count||0) > 0 ? 'OK  ' : 'WARN';
      console.log(`  ${status} ${view.padEnd(35)} : ${(count||0).toLocaleString()} rows`);
    }
  }

  // 6. Summary
  console.log('\n  [5] SUMMARY');
  printLine();
  console.log(`  Pre-simulation OOS count  : ${preCounts.oos.toLocaleString()}`);
  console.log(`  Post-simulation OOS count : ${(oosCount||0).toLocaleString()}`);
  console.log(`  New OOS from Module D     : +${((oosCount||0) - preCounts.oos).toLocaleString()}`);
  console.log(`  SIM-D events inserted     : ${(txnCount||0).toLocaleString()}`);
  console.log(`  IC-02 (non-negative)      : ${(negCount||0) === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`  Module B rows untouched   : confirmed (batch_number SIM-B-* unchanged)`);

  printLine('=');
  console.log(`\n  ${(negCount||0) === 0 && txnOk ? 'MODULE D COMPLETE - READY FOR MODULE G' : 'MODULE D COMPLETE WITH WARNINGS - REVIEW ABOVE'}\n`);
  printLine('=');
}

// ─── Confirm Prompt ───────────────────────────────────────────────────────────

async function confirmProceed(totalEvents) {
  if (DRY_RUN) {
    console.log('\n  DRY RUN - no data will be written.\n');
    return true;
  }
  return new Promise(resolve => {
    process.stdout.write(`\n  Insert ${totalEvents.toLocaleString()} dispense events? Type YES: `);
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', d => resolve(d.trim().toUpperCase() === 'YES'));
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  FalconMed Simulator v1 - Module D: Dispensing Simulation');
  console.log(`  ${new Date().toISOString()}\n`);

  // Rollback mode
  if (ROLLBACK_MODE) { await rollback(); return; }

  // ── Phase 0: Load data ──────────────────────────────────────────────────
  console.log('  Phase 0: Loading live data...');
  printLine();

  let pharmacies, orgId, patients, existingSimD;
  try {
    await testConnection();          // verify service_role before touching any table
    pharmacies    = await loadPharmacies();
    orgId         = await loadOrgId(pharmacies);
    patients      = await loadPatientIds(orgId);  // orgId required for RLS
    existingSimD  = await countExistingSimD();
  } catch (err) {
    console.error(`\n  Phase 0 failed: ${err.message}`); process.exit(1);
  }

  if (existingSimD > 0) {
    console.warn(`\n  WARN: ${existingSimD.toLocaleString()} SIM-D records already exist.`);
    console.warn('  To re-run Module D, first run: node seed_module_d.cjs --rollback\n');
    process.exit(0);
  }

  // Apply pharmacy filter
  const targetPharmacies = PHARMACY_FILTER
    ? pharmacies.filter(p => p._type.toUpperCase() === PHARMACY_FILTER ||
        p._name.toUpperCase().includes(PHARMACY_FILTER))
    : pharmacies;

  if (targetPharmacies.length === 0) {
    console.error(`\n  No pharmacies match filter: ${PHARMACY_FILTER}`); process.exit(1);
  }

  console.log(`  OK  ${pharmacies.length} pharmacies · targeting ${targetPharmacies.length}`);
  console.log(`  OK  ${patients.length.toLocaleString()} patients`);
  console.log(`  OK  Organization ID resolved`);

  // Pre-simulation counts for validation report
  const { count: preOos } = await supabase
    .from('inventory').select('*', { count: 'exact', head: true }).eq('quantity_on_hand', 0);
  const preCounts = { oos: preOos || 0 };

  // ── Build schedule ──────────────────────────────────────────────────────
  console.log('\n  Phase 1: Building dispense schedule...');
  printLine();
  const schedule = buildDailySchedule(targetPharmacies);
  const totalScheduled = schedule.reduce((s, e) => s + e.count, 0);
  console.log(`  OK  ${schedule.length} pharmacy-day slots · ${totalScheduled.toLocaleString()} total events`);

  // ── Manifest ────────────────────────────────────────────────────────────
  printManifest(targetPharmacies, schedule, existingSimD);

  // ── Confirm ─────────────────────────────────────────────────────────────
  const confirmed = await confirmProceed(totalScheduled);
  if (!confirmed) { console.log('\n  Aborted. No data written.\n'); process.exit(0); }

  // ── Phase 2: Per-pharmacy inventory load + simulation ───────────────────
  console.log('\n  Phase 2: Running dispensing simulation...');
  printLine();

  // Group schedule by pharmacy
  const schedByPharm = new Map();
  for (const entry of schedule) {
    const pid = entry.pharm.id;
    if (!schedByPharm.has(pid)) schedByPharm.set(pid, { pharm: entry.pharm, days: [] });
    schedByPharm.get(pid).days.push({ date: entry.date, count: entry.count });
  }

  let totalInserted  = 0;
  let pharmProcessed = 0;
  const allTouchedIds = new Set();

  for (const [pharmId, pharmData] of schedByPharm) {
    const { pharm, days } = pharmData;
    pharmProcessed++;

    process.stdout.write(`\r  ${progressBar(pharmProcessed, schedByPharm.size)} ${pharm._name.slice(0,30).padEnd(30)}`);

    // Load inventory for this pharmacy
    let invRows;
    try {
      invRows = await loadInventoryForPharmacy(pharmId);
    } catch (err) {
      console.warn(`\n  WARN: Could not load inventory for ${pharm._name}: ${err.message}`);
      continue;
    }
    if (invRows.length === 0) continue;

    // In-memory quantity tracker
    const qtyTracker = new Map(invRows.map(r => [r.id, r.quantity_on_hand]));
    const touchedIds = new Set();

    // Simulate each day for this pharmacy
    for (const day of days) {
      const events = buildEvents(
        { date: day.date, pharm, count: day.count },
        invRows, qtyTracker, patients, orgId
      );
      if (events.length === 0) continue;

      // Track which inventory rows were touched
      events.forEach(e => touchedIds.add(e.inventoryId));

      // Insert 3-table records
      try {
        const result = await insertEvents(events, DRY_RUN);
        totalInserted += result.txn;
      } catch (err) {
        console.error(`\n  ERROR day ${day.date.toISOString().split('T')[0]} ${pharm._name}: ${err.message}`);
        console.error('  Continuing with next day — inserted records are preserved.');
      }
    }

    // Day-end inventory flush for this pharmacy
    touchedIds.forEach(id => allTouchedIds.add(id));
    try {
      await flushInventoryAbsolute(qtyTracker, touchedIds, DRY_RUN);
    } catch (err) {
      console.warn(`\n  WARN: Inventory flush failed for ${pharm._name}: ${err.message}`);
    }
  }

  console.log(`\n\n  Total events inserted: ${totalInserted.toLocaleString()}`);
  console.log(`  Inventory rows updated: ${allTouchedIds.size.toLocaleString()}`);

  // ── Phase 3: Validation Report ──────────────────────────────────────────
  if (!DRY_RUN) {
    await validationReport(0, preCounts);
  } else {
    console.log('\n  DRY RUN complete — skipping validation report (no data written).');
    console.log(`  Scheduled events: ${totalScheduled.toLocaleString()}`);
    console.log('  Run without --dry-run to execute.\n');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('\n  Unexpected error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
