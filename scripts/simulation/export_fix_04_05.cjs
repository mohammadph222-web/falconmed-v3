/**
 * FalconMed v3 — Export FAL_04 and FAL_05 (fixed)
 * File: scripts/simulation/export_fix_04_05.cjs
 *
 * FAL_04: queries inventory directly (bypasses vw_out_of_stock_inventory JOIN issue)
 * FAL_05: queries patient_dispense_history directly (bypasses vw_dispensing_activity 1000-row limit)
 *
 * RUN:
 *   node scripts/simulation/export_fix_04_05.cjs
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

// ─── Client ──────────────────────────────────────────────────────────────────

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  return;
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

// ─── Output folder ────────────────────────────────────────────────────────────

const OUT = path.resolve('exports', 'PowerBI');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map(h => esc(row[h])).join(','));
  return lines.join('\n');
}

function save(filename, rows) {
  const filepath = path.join(OUT, filename);
  fs.writeFileSync(filepath, toCSV(rows), 'utf8');
  const kb = Math.round(fs.statSync(filepath).size / 1024);
  return kb;
}

// Paginate any table/view with explicit range
async function fetchAllPaged(tableName, selectCols, orderCol, extraFilter) {
  const PAGE = 1000;
  let all = [], offset = 0;

  while (true) {
    let q = supabase
      .from(tableName)
      .select(selectCols)
      .order(orderCol, { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (extraFilter) q = extraFilter(q);

    const { data, error } = await q;
    if (error) throw new Error(`${tableName}: ${error.message}`);
    if (!data || data.length === 0) break;

    all = all.concat(data);
    process.stdout.write(`\r  Fetching ${tableName}: ${all.length.toLocaleString()} rows...`);

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  if (all.length > 0) process.stdout.write('\n');
  return all;
}

// ─── FAL_04: Out of Stock ────────────────────────────────────────────────────
// Query inventory directly — avoids vw_out_of_stock_inventory JOIN failure
async function exportOutOfStock() {
  const rows = await fetchAllPaged(
    'inventory',
    'id, pharmacy_id, drug_code, batch_number, expiry_date, quantity_on_hand, minimum_stock, maximum_stock, unit_cost, inventory_status, received_date',
    'pharmacy_id',
    (q) => q.lte('quantity_on_hand', 0)
  );

  // Add computed field
  const enriched = rows.map(r => ({
    ...r,
    stock_status: 'OUT_OF_STOCK',
    inventory_value_aed: 0,
  }));

  const kb = save('FAL_04_Out_of_Stock_20260619.csv', enriched);
  console.log(`  OK   FAL_04_Out_of_Stock_20260619.csv`);
  console.log(`       ${enriched.length.toLocaleString()} rows · ${kb} KB\n`);
  return enriched.length;
}

// ─── FAL_05: Dispensing Activity ─────────────────────────────────────────────
// Query patient_dispense_history directly — bypasses vw_dispensing_activity 1000-row cap
async function exportDispensingActivity() {
  const rows = await fetchAllPaged(
    'patient_dispense_history',
    'id, patient_id, pharmacy_id, drug_code, generic_name, brand_name, strength, quantity_dispensed, dispense_date, dispensed_by, transaction_id, notes, created_at',
    'dispense_date',
    null
  );

  const kb = save('FAL_05_Dispensing_Activity_20260619.csv', rows);
  console.log(`  OK   FAL_05_Dispensing_Activity_20260619.csv`);
  console.log(`       ${rows.length.toLocaleString()} rows · ${kb} KB\n`);
  return rows.length;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  FalconMed v3 — Export Fix: FAL_04 + FAL_05');
  console.log(`  Output: ${OUT}\n`);
  console.log('  ' + '-'.repeat(68));

  let total = 0;
  let passed = 0;

  try {
    const n = await exportOutOfStock();
    total += n; passed++;
  } catch (err) {
    console.error(`  FAIL FAL_04: ${err.message}\n`);
  }

  try {
    const n = await exportDispensingActivity();
    total += n; passed++;
  } catch (err) {
    console.error(`  FAIL FAL_05: ${err.message}\n`);
  }

  console.log('  ' + '-'.repeat(68));
  console.log(`  ${passed} / 2 files exported · ${total.toLocaleString()} total rows`);
  console.log(`  Folder: ${OUT}\n`);
}

main().catch(err => {
  console.error('\n  Unexpected error:', err.message);
});
