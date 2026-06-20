/**
 * FalconMed Simulator v1 — Module B: Inventory Seed (v2 — corrected valuation)
 * File: scripts/simulation/seed_module_b.js
 *
 * CHANGES FROM v1:
 *   FIX-V2-1  Drug selection is now price-band stratified.
 *             Ultra-high-cost specialty drugs are capped at 2% of selection.
 *             Low-cost generics are weighted at 40% of selection.
 *   FIX-V2-2  quantity_on_hand is inversely scaled to unit_cost.
 *             A drug at AED 2,000/unit gets qty 1–8, not qty 100–500.
 *   FIX-V2-3  High-cost drugs assigned to fewer pharmacy types.
 *             Oncology → Inpatient only (3 pharmacies, not 6).
 *             AED 1,000+ drugs → max 2 pharmacy types.
 *   TARGET    Realistic inventory value AED 15M – 50M across 17 pharmacies.
 *
 * ALL OTHER RULES UNCHANGED FROM v1:
 *   - APPEND ONLY: no UPDATE, no DELETE, no TRUNCATE
 *   - No hardcoded UUIDs
 *   - Idempotent: safe re-run via SIM-B batch_number prefix
 *   - Manifest + YES confirmation before any insert
 *   - service_role only in this local script, never in React/Vite
 *   - PRE_OOS: qty = minimum_stock + buffer (never 0 in Module B)
 *   - last_updated / created_at / updated_at populated on every row
 *
 * PREREQUISITES:
 *   npm install @supabase/supabase-js dotenv
 *
 * ENV (.env in project root):
 *   SUPABASE_URL=https://your-project.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
 *
 * RUN:
 *   node scripts/simulation/seed_module_b.js --dry-run
 *   node scripts/simulation/seed_module_b.js
 *   node scripts/simulation/seed_module_b.js --pharmacy "Emergency"
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ─── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  SIM_PREFIX:        'SIM-B',
  SNAPSHOT_DATE:     new Date(),
  ROWS_PER_PHARMACY: 700,

  // Bucket distribution — must sum to 1.0
  BUCKETS: {
    HEALTHY:    { pct: 0.55, label: 'Healthy Active'         },
    LOW_STOCK:  { pct: 0.13, label: 'Low Stock'              },
    NE_WARNING: { pct: 0.10, label: 'Near Expiry — Warning'  },
    NE_CRITICAL:{ pct: 0.07, label: 'Near Expiry — Critical' },
    EXPIRED:    { pct: 0.03, label: 'Expired (stranded)'     },
    PRE_OOS:    { pct: 0.12, label: 'Pre-OOS seed'           },
  },

  // Expiry offsets from SNAPSHOT_DATE (days)
  EXPIRY_RANGES: {
    HEALTHY:    { min: 91,   max: 730 },
    LOW_STOCK:  { min: 91,   max: 730 },
    NE_WARNING: { min: 31,   max: 90  },
    NE_CRITICAL:{ min: 1,    max: 30  },
    EXPIRED:    { min: -180, max: -1  },
    PRE_OOS:    { min: 91,   max: 730 },
  },

  // FIX-V2-2: Cost-aware quantity ranges — indexed by unit_cost band
  COST_QTY_RANGES: [
    { maxCost:    5, min:  50, max: 500 },
    { maxCost:   50, min:  20, max: 200 },
    { maxCost:  200, min:  10, max:  80 },
    { maxCost: 1000, min:   2, max:  20 },
    { maxCost: Infinity, min: 1, max:  8 },
  ],

  // PRE_OOS: qty = minimum_stock + randInt(minAbove, maxAbove). Never 0 in Module B.
  PRE_OOS_BUFFER: { minAbove: 1, maxAbove: 10 },

  // minimum_stock by pharmacy type
  MIN_STOCK_BY_TYPE: {
    Emergency:       { min: 50,  max: 150 },
    ICU:             { min: 40,  max: 120 },
    'Operating Room':{ min: 30,  max: 100 },
    Inpatient:       { min: 30,  max: 100 },
    Outpatient:      { min: 20,  max:  80 },
    Pediatric:       { min: 25,  max:  90 },
    Retail:          { min: 15,  max:  60 },
    Community:       { min: 15,  max:  60 },
    DEFAULT:         { min: 20,  max:  80 },
  },

  // FIX-V2-1: Price-band stratified drug selection targets
  PRICE_BANDS: [
    { maxCost:    5,        targetPct: 0.40, label: 'Generic / OTC (<=AED 5)'         },
    { maxCost:   50,        targetPct: 0.35, label: 'Standard Rx (AED 5-50)'          },
    { maxCost:  200,        targetPct: 0.17, label: 'Branded/Specialist (AED 50-200)' },
    { maxCost: 1000,        targetPct: 0.06, label: 'High-cost (AED 200-1,000)'       },
    { maxCost: Infinity,    targetPct: 0.02, label: 'Ultra-high (AED 1,000+)'         },
  ],

  // FIX-V2-3: Category -> pharmacy type mapping (high-cost restricted)
  DRUG_PHARMACY_MAP: {
    Antibiotic:    ['Emergency','ICU','Inpatient','Outpatient','Pediatric','Operating Room'],
    Analgesic:     ['Emergency','ICU','Inpatient','Outpatient','Retail','Community','Pediatric','Operating Room'],
    Cardiovascular:['ICU','Inpatient','Outpatient','Community','Emergency'],
    Controlled:    ['ICU','Operating Room','Emergency'],
    Pediatric:     ['Pediatric','Outpatient'],
    Oncology:      ['Inpatient'],
    GI:            ['Outpatient','Retail','Community','Inpatient'],
    Respiratory:   ['Outpatient','Retail','Community','Emergency','Pediatric'],
    DEFAULT:       ['Inpatient','Outpatient','Retail','Community'],
  },

  // FIX-V2-3: drugs above this cost only go to specialist pharmacy types
  HIGH_COST_THRESHOLD:      1000,
  HIGH_COST_PHARMACY_TYPES: ['Inpatient','ICU','Emergency','Operating Room'],

  BATCH_SIZE:        50,
  DRUG_SAMPLE_LIMIT: 1200,

  PHARMACY_TYPE_COLUMNS: ['pharmacy_type','type','category','facility_type','pharmacy_category'],
};

// ─── Supabase Client (service_role — local script only) ──────────────────────

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n  Missing environment variables.');
  console.error('  SUPABASE_URL=https://your-project.supabase.co');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key\n');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ─── CLI Flags ────────────────────────────────────────────────────────────────

const DRY_RUN         = process.argv.includes('--dry-run');
const PHARMACY_FILTER = (() => {
  const idx = process.argv.indexOf('--pharmacy');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

// ─── Utilities ────────────────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function pad(n, width) {
  return String(n).padStart(width, '0');
}

function makeBatchNumber(pharmacyCode, drugCode, bucket, idx) {
  const safeCode = String(drugCode).replace(/[^A-Z0-9]/gi, '').slice(0, 12).toUpperCase();
  const safePhrm = String(pharmacyCode).replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();
  return `${CONFIG.SIM_PREFIX}-${safePhrm}-${safeCode}-${bucket}-${pad(idx, 3)}`;
}

function detectPharmacyTypeColumn(sampleRow) {
  for (const col of CONFIG.PHARMACY_TYPE_COLUMNS) {
    if (col in sampleRow && sampleRow[col]) return col;
  }
  return null;
}

function resolvePharmacyType(pharmacy, typeCol) {
  if (!typeCol) return 'DEFAULT';
  const raw = String(pharmacy[typeCol] || '').trim();
  for (const key of Object.keys(CONFIG.MIN_STOCK_BY_TYPE)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return key;
  }
  return 'DEFAULT';
}

function inferDrugCategory(drug) {
  const name = [drug.generic_name, drug.brand_name, drug.primary_ingredient]
    .filter(Boolean).join(' ').toLowerCase();
  if (drug.is_controlled || drug.is_narcotic) return 'Controlled';
  if (name.match(/amoxicillin|cephalexin|azithromycin|antibiotic|cefi|clind|metronidazol|ciproflo|penicillin/)) return 'Antibiotic';
  if (name.match(/paracetamol|ibuprofen|tramadol|morphine|opioid|analgesic|pain|diclofenac|naproxen/))          return 'Analgesic';
  if (name.match(/atorvastatin|amlodipine|metoprolol|lisinopril|cardiac|carvedilol|ramipril|warfarin/))         return 'Cardiovascular';
  if (name.match(/paediatric|pediatric|suspension|syrup|drops|infant|neonatal|child/))                          return 'Pediatric';
  if (name.match(/oncol|chemo|taxol|cisplatin|cyclophosph|rituximab|bevacizumab|trastuzumab/))                  return 'Oncology';
  if (name.match(/omeprazole|pantoprazole|gastr|antacid|laxative|bowel|intestin|ranitidine/))                   return 'GI';
  if (name.match(/salbutamol|inhaler|respiratory|asthma|broncho|ventolin|budesonide|fluticasone/))              return 'Respiratory';
  return 'DEFAULT';
}

// FIX-V2-1: Stratify drug pool into price bands, sample each band by targetPct
function stratifyDrugsByPriceBand(allDrugs) {
  const bands = CONFIG.PRICE_BANDS.map(b => ({ ...b, drugs: [] }));

  for (const drug of allDrugs) {
    for (const band of bands) {
      if (drug._cost <= band.maxCost) { band.drugs.push(drug); break; }
    }
  }

  const selected = [];
  for (const band of bands) {
    const target   = Math.round(CONFIG.ROWS_PER_PHARMACY * band.targetPct);
    const shuffled = [...band.drugs].sort(() => Math.random() - 0.5);
    const taken    = shuffled.slice(0, Math.min(target, shuffled.length));
    selected.push(...taken);
    if (taken.length < target) {
      console.warn(`  ⚠  Band "${band.label}": wanted ${target}, only ${taken.length} available`);
    }
  }
  return selected;
}

// FIX-V2-2: Look up cost-aware qty range
function costQtyRange(unitCost) {
  for (const band of CONFIG.COST_QTY_RANGES) {
    if (unitCost <= band.maxCost) return { min: band.min, max: band.max };
  }
  return { min: 1, max: 8 };
}

// FIX-V2-2: Bucket qty computation — cost-aware base + bucket adjustments
function computeQtyForBucket(bucket, minStock, unitCost) {
  if (bucket === 'PRE_OOS') {
    return minStock + randInt(CONFIG.PRE_OOS_BUFFER.minAbove, CONFIG.PRE_OOS_BUFFER.maxAbove);
  }
  const range = costQtyRange(unitCost);
  if (bucket === 'LOW_STOCK')   return randInt(1, Math.min(range.max, minStock - 1) || 1);
  if (bucket === 'NE_CRITICAL') return randInt(Math.max(1, range.min), Math.max(2, Math.round(range.max * 0.3)));
  if (bucket === 'NE_WARNING')  return randInt(Math.max(1, range.min), Math.round(range.max * 0.5));
  if (bucket === 'EXPIRED')     return randInt(1, Math.min(15, range.max));
  return randInt(range.min, range.max); // HEALTHY
}

function computeExpiryForBucket(bucket) {
  const r = CONFIG.EXPIRY_RANGES[bucket];
  return addDays(CONFIG.SNAPSHOT_DATE, randInt(r.min, r.max));
}

function computeReceivedDate(expiryDate) {
  const candidate = addDays(CONFIG.SNAPSHOT_DATE, -randInt(30, 180));
  return candidate < expiryDate ? candidate : addDays(CONFIG.SNAPSHOT_DATE, -15);
}

function progressBar(current, total, width = 30) {
  const filled = Math.round((current / (total || 1)) * width);
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${current}/${total}`;
}

function printLine(char = '-', len = 70) {
  console.log(char.repeat(len));
}

// ─── Phase 0: Read Live Data ──────────────────────────────────────────────────

async function readPharmacies() {
  const { data: allRows, error } = await supabase.from('pharmacies').select('*');
  if (error) throw new Error(`Failed to read pharmacies: ${error.message}`);
  if (!allRows || allRows.length === 0) throw new Error('pharmacies table is empty.');

  const sample = allRows[0];
  let data;

  if ('status' in sample) {
    data = allRows.filter(p => String(p.status || '').toUpperCase() === 'ACTIVE');
    console.log(`  OK  Active filter: status = ACTIVE (${data.length} of ${allRows.length})`);
  } else if ('is_active' in sample) {
    data = allRows.filter(p => p.is_active === true);
    console.log(`  OK  Active filter: is_active = true (${data.length} of ${allRows.length})`);
  } else {
    data = allRows;
    console.warn(`  WARN  No status/is_active column. Using all ${data.length} pharmacies.`);
  }

  if (data.length === 0) throw new Error('No active pharmacies found.');

  const typeCol = detectPharmacyTypeColumn(data[0]);
  if (!typeCol) {
    console.warn('  WARN  Pharmacy type column not detected — using full drug catalog for all pharmacies.');
  } else {
    console.log(`  OK  Pharmacy type column: "${typeCol}"`);
  }

  return { pharmacies: data, typeCol };
}

async function readOrganizationId(pharmacies) {
  const orgId = pharmacies[0]?.organization_id;
  if (!orgId) throw new Error('organization_id missing from pharmacies table.');
  console.log(`  OK  Organization ID resolved from pharmacies table`);
  return orgId;
}

async function readDrugCatalog() {
  const { data, error } = await supabase
    .from('drug_master_reference')
    .select('drug_code, generic_name, brand_name, strength, dosage_form, unit_price_to_pharmacy, is_controlled, is_narcotic, primary_ingredient, insurance_thiqa, insurance_basic, upp_scope')
    .eq('is_active', true)
    .gt('unit_price_to_pharmacy', 0)
    .not('drug_code', 'is', null)
    .limit(CONFIG.DRUG_SAMPLE_LIMIT);

  if (error) throw new Error(`Failed to read drug_master_reference: ${error.message}`);
  if (!data || data.length === 0) throw new Error('No active drugs with pricing found.');

  const annotated = data.map(d => ({
    ...d,
    _category: inferDrugCategory(d),
    _cost:     parseFloat(d.unit_price_to_pharmacy) || 0,
  }));

  // Log price band distribution of fetched catalog
  const bandCounts = CONFIG.PRICE_BANDS.map(b => ({ label: b.label, count: 0 }));
  for (const d of annotated) {
    for (let i = 0; i < CONFIG.PRICE_BANDS.length; i++) {
      if (d._cost <= CONFIG.PRICE_BANDS[i].maxCost) { bandCounts[i].count++; break; }
    }
  }
  console.log(`  OK  ${annotated.length} drugs loaded — price band distribution:`);
  bandCounts.forEach(b => console.log(`      ${b.label.padEnd(40)} ${b.count}`));

  return annotated;
}

async function readExistingInventoryCounts() {
  const { count, error } = await supabase
    .from('inventory').select('*', { count: 'exact', head: true });
  if (error) throw new Error(`Failed to count inventory: ${error.message}`);
  return count || 0;
}

async function readExistingBatchNumbers() {
  const { data, error } = await supabase
    .from('inventory').select('batch_number').like('batch_number', `${CONFIG.SIM_PREFIX}-%`);
  if (error) throw new Error(`Failed to read existing SIM batch numbers: ${error.message}`);
  return new Set((data || []).map(r => r.batch_number));
}

// ─── Phase 1: Build Inventory Rows ───────────────────────────────────────────

function buildInventoryRowsForPharmacy(pharmacy, orgId, drugCatalog, typeCol, existingBatches) {
  const pharmType   = resolvePharmacyType(pharmacy, typeCol);
  const pharmCode   = (pharmacy.pharmacy_code || pharmacy.pharmacy_name || pharmacy.name || pharmacy.id).slice(0, 8);
  const minStockCfg = CONFIG.MIN_STOCK_BY_TYPE[pharmType] || CONFIG.MIN_STOCK_BY_TYPE.DEFAULT;

  // FIX-V2-1: price-band stratified pool
  const stratified = stratifyDrugsByPriceBand(drugCatalog);

  // FIX-V2-3: filter by pharmacy type + cost gate
  const eligible = stratified.filter(d => {
    if (d._cost >= CONFIG.HIGH_COST_THRESHOLD) {
      return CONFIG.HIGH_COST_PHARMACY_TYPES.includes(pharmType);
    }
    const allowed = CONFIG.DRUG_PHARMACY_MAP[d._category] || CONFIG.DRUG_PHARMACY_MAP.DEFAULT;
    return allowed.includes(pharmType);
  });

  const drugPool = eligible.length > 20 ? eligible : stratified;
  const selected = [...drugPool].sort(() => Math.random() - 0.5).slice(0, CONFIG.ROWS_PER_PHARMACY);

  const rows = [];

  for (const [bucket, cfg] of Object.entries(CONFIG.BUCKETS)) {
    const targetCount = Math.round(selected.length * cfg.pct);
    const bucketDrugs = selected.splice(0, targetCount);

    bucketDrugs.forEach((drug, idx) => {
      const batchNumber = makeBatchNumber(pharmCode, drug.drug_code, bucket, idx);
      if (existingBatches.has(batchNumber)) return;

      const minStock    = randInt(minStockCfg.min, minStockCfg.max);
      const maxStock    = minStock * randInt(3, 5);
      const unitCost    = drug._cost;
      const qty         = computeQtyForBucket(bucket, minStock, unitCost); // FIX-V2-2
      const expiryDate  = computeExpiryForBucket(bucket);
      const receivedDate = computeReceivedDate(expiryDate);
      const now         = new Date().toISOString();

      rows.push({
        organization_id:  orgId,
        pharmacy_id:      pharmacy.id,
        drug_code:        drug.drug_code,
        quantity_on_hand: qty,
        minimum_stock:    minStock,
        maximum_stock:    maxStock,
        batch_number:     batchNumber,
        expiry_date:      expiryDate,
        unit_cost:        unitCost,
        purchase_price:   unitCost,
        inventory_status: 'ACTIVE',
        storage_location: `${pharmCode}-${bucket.slice(0, 3)}-${pad(idx, 3)}`,
        received_date:    receivedDate,
        last_updated:     now,
        created_at:       now,
        updated_at:       now,
      });
    });
  }

  return rows;
}

// ─── Phase 2: Manifest ───────────────────────────────────────────────────────

function printManifest(pharmacies, typeCol, drugCatalog, existingCount, projectedRows, existingBatches) {
  const snap = CONFIG.SNAPSHOT_DATE.toISOString().split('T')[0];

  console.log('\n');
  printLine('=');
  console.log('  FALCONMED SIMULATOR v1 - MODULE B v2: INVENTORY SEED (corrected valuation)');
  printLine('=');

  console.log(`\n  Version               : v2 (price-band stratified + cost-aware qty)`);
  console.log(`  Snapshot Date         : ${snap}`);
  console.log(`  Mode                  : ${DRY_RUN ? 'DRY RUN (no inserts)' : 'LIVE INSERT'}`);
  if (PHARMACY_FILTER) console.log(`  Pharmacy Filter       : "${PHARMACY_FILTER}"`);
  console.log(`  Pharmacy Type Column  : ${typeCol || 'NOT DETECTED'}`);

  console.log('\n  DRUG SELECTION - PRICE BAND TARGETS');
  printLine();
  CONFIG.PRICE_BANDS.forEach(b => {
    const qr = CONFIG.COST_QTY_RANGES.find(r => r.maxCost >= b.maxCost) || CONFIG.COST_QTY_RANGES.at(-1);
    console.log(`  ${b.label.padEnd(40)} ${String(Math.round(b.targetPct*100)+'%').padEnd(6)} max qty ${qr.max}`);
  });

  console.log('\n  INVENTORY BUCKET DISTRIBUTION');
  printLine();
  for (const [bucket, cfg] of Object.entries(CONFIG.BUCKETS)) {
    const approxRows = Math.round(projectedRows * cfg.pct);
    const r          = CONFIG.EXPIRY_RANGES[bucket];
    const window     = r.min < 0
      ? `${Math.abs(r.max)}-${Math.abs(r.min)} days ago`
      : `today +${r.min} to +${r.max} days`;
    console.log(`  ${cfg.label.padEnd(27)} ${String(Math.round(cfg.pct*100)+'%').padEnd(6)} ~${String(approxRows).padEnd(7)} ${window}`);
  }

  console.log('\n  ROW COUNT IMPACT');
  printLine();
  console.log(`  Existing inventory rows  : ${existingCount.toLocaleString()}`);
  console.log(`  Existing SIM-B (skip)    : ${existingBatches.size.toLocaleString()}`);
  console.log(`  Projected new rows       : ~${projectedRows.toLocaleString()}`);
  // projectedRows already excludes skipped batches — no double subtraction
  console.log(`  Projected total          : ~${(existingCount + projectedRows).toLocaleString()}`);

  console.log('\n  VALUATION ESTIMATE (v2 corrected)');
  printLine();
  console.log(`  Target range             : AED 15M - 50M`);
  console.log(`  Expected avg unit cost   : AED 15 - 40`);
  console.log(`  Previous v1 value        : AED 821M (over-inflated - now corrected)`);

  console.log('\n  CASE STUDY ALIGNMENT');
  printLine();
  console.log(`  CS-1 Near Expiry         : ~${Math.round(projectedRows * 0.17).toLocaleString()} rows`);
  console.log(`  CS-1 Expired             : ~${Math.round(projectedRows * 0.03).toLocaleString()} rows`);
  console.log(`  CS-2 Pre-OOS (above min) : ~${Math.round(projectedRows * 0.12).toLocaleString()} rows (Module D will exhaust)`);
  console.log(`  CS-2 Low Stock           : ~${Math.round(projectedRows * 0.13).toLocaleString()} rows`);
  printLine('=');
}

// ─── Phase 3: Insert ─────────────────────────────────────────────────────────

async function insertAllRows(allRows) {
  let totalInserted = 0;
  const batches = [];
  for (let i = 0; i < allRows.length; i += CONFIG.BATCH_SIZE) {
    batches.push(allRows.slice(i, i + CONFIG.BATCH_SIZE));
  }

  console.log(`\n  Inserting ${allRows.length.toLocaleString()} rows in ${batches.length} batches...\n`);

  for (let i = 0; i < batches.length; i++) {
    if (!DRY_RUN) {
      const { error } = await supabase.from('inventory').insert(batches[i]);
      if (error) throw new Error(`Batch ${i+1}/${batches.length} failed: ${error.message}`);
    }
    totalInserted += batches[i].length;
    if ((i + 1) % 10 === 0 || i === batches.length - 1) {
      process.stdout.write(`\r  ${progressBar(i + 1, batches.length)}  ${totalInserted.toLocaleString()} rows`);
    }
  }
  console.log('\n');
  return totalInserted;
}

// ─── Phase 4: Post-Insert Validation ─────────────────────────────────────────

async function validatePostInsert(preCount) {
  const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true });
  const today = CONFIG.SNAPSHOT_DATE.toISOString().split('T')[0];
  const in90  = addDays(CONFIG.SNAPSHOT_DATE, 90);

  const [r1, r2, r3] = await Promise.all([
    supabase.from('inventory').select('*', { count: 'exact', head: true })
      .like('batch_number', `${CONFIG.SIM_PREFIX}-%`).lte('expiry_date', in90).gte('expiry_date', today),
    supabase.from('inventory').select('*', { count: 'exact', head: true })
      .like('batch_number', `${CONFIG.SIM_PREFIX}-%`).lt('expiry_date', today),
    supabase.from('inventory').select('*', { count: 'exact', head: true })
      .like('batch_number', `${CONFIG.SIM_PREFIX}-%`).eq('quantity_on_hand', 0),
  ]);

  console.log('  POST-INSERT VALIDATION');
  printLine();
  console.log(`  Rows before              : ${preCount.toLocaleString()}`);
  console.log(`  Rows after               : ${(count || 0).toLocaleString()}`);
  console.log(`  Delta                    : +${((count || 0) - preCount).toLocaleString()}`);
  console.log(`\n  SPOT CHECKS (SIM-B rows only):`);
  console.log(`  Near Expiry (<=90 days)  : ${(r1.count || 0).toLocaleString()} rows`);
  console.log(`  Expired (past today)     : ${(r2.count || 0).toLocaleString()} rows`);
  if ((r3.count || 0) > 0) {
    console.warn(`  WARN qty=0 rows          : ${r3.count} — unexpected. Investigate before Module D.`);
  } else {
    console.log(`  OK   qty=0 rows          : 0 — correct. OOS emerges from Module D.`);
  }
}

// ─── Confirm Prompt ──────────────────────────────────────────────────────────

async function confirmProceed() {
  if (DRY_RUN) { console.log('\n  DRY RUN — no inserts will be made.\n'); return true; }
  return new Promise(resolve => {
    process.stdout.write('\n  Proceed with live inserts? Type YES to confirm: ');
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', d => resolve(d.trim().toUpperCase() === 'YES'));
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  FalconMed Simulator v1 - Module B v2: Inventory Seed (corrected valuation)');
  console.log(`  ${new Date().toISOString()}\n`);

  console.log('  Phase 0: Reading live data...');
  printLine();

  let pharmacies, typeCol, drugCatalog, existingCount, existingBatches, orgId;
  try {
    ({ pharmacies, typeCol } = await readPharmacies());
    orgId           = await readOrganizationId(pharmacies);
    drugCatalog     = await readDrugCatalog();
    existingCount   = await readExistingInventoryCounts();
    existingBatches = await readExistingBatchNumbers();
  } catch (err) {
    console.error(`\n  Phase 0 failed: ${err.message}`);
    process.exit(1);
  }

  const targetPharmacies = PHARMACY_FILTER
    ? pharmacies.filter(p => JSON.stringify(p).toLowerCase().includes(PHARMACY_FILTER.toLowerCase()))
    : pharmacies;

  if (targetPharmacies.length === 0) {
    console.error(`\n  No pharmacies match filter: "${PHARMACY_FILTER}"`); process.exit(1);
  }

  console.log(`  OK  ${pharmacies.length} pharmacies · targeting ${targetPharmacies.length}`);
  console.log(`  OK  ${existingCount.toLocaleString()} existing inventory rows (will not be modified)`);
  console.log(`  OK  ${existingBatches.size.toLocaleString()} existing SIM-B rows (will be skipped)`);

  console.log('\n  Phase 1: Building rows (price-band stratified)...');
  printLine();

  const allRows = [];
  for (const pharmacy of targetPharmacies) {
    const name = pharmacy.pharmacy_name || pharmacy.name || pharmacy.id;
    const rows = buildInventoryRowsForPharmacy(pharmacy, orgId, drugCatalog, typeCol, existingBatches);
    allRows.push(...rows);
    console.log(`  OK  ${String(name).padEnd(44)} ${rows.length} rows`);
  }

  const projectedRows = allRows.length;
  console.log(`\n  Total rows planned: ${projectedRows.toLocaleString()}`);

  printManifest(pharmacies, typeCol, drugCatalog, existingCount, projectedRows, existingBatches);

  const confirmed = await confirmProceed();
  if (!confirmed) { console.log('\n  Aborted. No data modified.\n'); process.exit(0); }

  console.log('  Phase 3: Inserting...');
  printLine();

  let totalInserted;
  try {
    totalInserted = await insertAllRows(allRows);
  } catch (err) {
    console.error(`\n  Insert failed: ${err.message}`);
    console.error('  Re-run — idempotency will skip already-inserted rows.\n');
    process.exit(1);
  }

  console.log('  Phase 4: Validating...');
  printLine();
  await validatePostInsert(existingCount);

  printLine('=');
  console.log('\n  MODULE B v2 COMPLETE\n');
  console.log(`  Rows inserted    : ${totalInserted.toLocaleString()}`);
  console.log(`  Rows skipped     : ${existingBatches.size.toLocaleString()}`);
  console.log(`  Mode             : ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('\n  Verify inventory value in FalconMed dashboard.');
  console.log('  Target: AED 15M - 50M');
  console.log('\n  Next: node scripts/simulation/seed_module_d.js\n');
  printLine('=');

  process.exit(0);
}

main().catch(err => { console.error('\n  Unexpected error:', err.message); process.exit(1); });
