/**
 * FalconMed v3 — Export Missing Power BI Files
 * File: scripts/simulation/export_missing_powerbi.cjs
 *
 * Exports 3 missing files to exports/PowerBI/:
 *   FAL_04_Out_of_Stock_20260619.csv
 *   FAL_05_Dispensing_Activity_20260619.csv
 *   FAL_10_Inventory_Value_by_Pharmacy_20260619.csv
 *
 * RUN:
 *   node scripts/simulation/export_missing_powerbi.cjs
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

async function fetchAll(viewName) {
  const PAGE = 5000;
  let all = [], offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(viewName)
      .select('*')
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`${viewName}: ${error.message}`);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
    process.stdout.write(`\r  Fetching ${viewName}: ${all.length.toLocaleString()} rows...`);
  }
  if (all.length > PAGE) console.log('');
  return all;
}

function save(filename, rows) {
  const filepath = path.join(OUT, filename);
  fs.writeFileSync(filepath, toCSV(rows), 'utf8');
  const kb = Math.round(fs.statSync(filepath).size / 1024);
  return kb;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

const TARGETS = [
  {
    view:     'vw_out_of_stock_inventory',
    filename: 'FAL_04_Out_of_Stock_20260619.csv',
    label:    'Out of Stock',
  },
  {
    view:     'vw_dispensing_activity',
    filename: 'FAL_05_Dispensing_Activity_20260619.csv',
    label:    'Dispensing Activity',
  },
  {
    view:     'vw_inventory_value_by_pharmacy',
    filename: 'FAL_10_Inventory_Value_by_Pharmacy_20260619.csv',
    label:    'Inventory Value by Pharmacy',
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  FalconMed v3 — Export Missing Power BI Files');
  console.log(`  Output: ${OUT}\n`);
  console.log('  ' + '-'.repeat(68));

  let passed = 0;

  for (const target of TARGETS) {
    try {
      const rows = await fetchAll(target.view);
      const kb   = save(target.filename, rows);
      console.log(`  OK   ${target.filename}`);
      console.log(`       ${rows.length.toLocaleString()} rows · ${kb} KB\n`);
      passed++;
    } catch (err) {
      console.error(`  FAIL ${target.filename}`);
      console.error(`       ${err.message}\n`);
    }
  }

  console.log('  ' + '-'.repeat(68));
  console.log(`  ${passed} / ${TARGETS.length} files exported successfully`);
  console.log(`  Folder: ${OUT}\n`);
}

main().catch(err => {
  console.error('\n  Unexpected error:', err.message);
});
