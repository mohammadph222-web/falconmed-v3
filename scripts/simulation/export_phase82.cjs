/**
 * FalconMed v3 — Phase 8.2 Export Plan
 * Generates: exports/PowerBI/[filename].csv via Supabase queries
 * Purpose: Stable offline dataset for Power BI learning and Case Study creation
 *
 * File: scripts/simulation/export_phase82.cjs
 *
 * RUN:
 *   node scripts/simulation/export_phase82.cjs
 *   node scripts/simulation/export_phase82.cjs --view inventory_snapshot
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

// ─── Client ──────────────────────────────────────────────────────────────────

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n  ERROR: Missing env vars.\n'); process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } },
  }
);

// ─── Output folder ────────────────────────────────────────────────────────────

const EXPORT_DIR = path.resolve('exports/PowerBI');
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

const TODAY = new Date().toISOString().split('T')[0].replace(/-/g, '');

// ─── CSV helper ───────────────────────────────────────────────────────────────

function toCSV(rows) {
  if (!rows?.length) return '';
  const headers = Object.keys(rows[0]);
  const escape  = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  rows.forEach(r => lines.push(headers.map(h => escape(r[h])).join(',')));
  return lines.join('\n');
}

function writeCSV(filename, rows) {
  const filepath = path.join(EXPORT_DIR, filename);
  fs.writeFileSync(filepath, toCSV(rows), 'utf8');
  return filepath;
}

function printLine(c = '-', n = 72) { console.log(c.repeat(n)); }

// ─── Export definitions ───────────────────────────────────────────────────────

const EXPORTS = [

  // ── 1. Inventory Snapshot ─────────────────────────────────────────────────
  {
    id:       'inventory_snapshot',
    filename: `FAL_01_Inventory_Snapshot_${TODAY}.csv`,
    label:    'Inventory Snapshot — All 19,865 rows',
    pbi_use:  'Inventory value matrix · OOS/NE/Expired slicers · Per-pharmacy breakdown',
    source:   'inventory JOIN pharmacies JOIN drug_master_reference',
    async fetch() {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          id,
          pharmacy_id,
          drug_code,
          batch_number,
          expiry_date,
          quantity_on_hand,
          minimum_stock,
          maximum_stock,
          unit_cost,
          inventory_status,
          received_date,
          storage_location
        `)
        .order('pharmacy_id')
        .order('drug_code');
      if (error) throw error;

      // Annotate with computed fields
      const today = new Date();
      return (data || []).map(r => {
        const exp   = r.expiry_date ? new Date(r.expiry_date) : null;
        const days  = exp ? Math.round((exp - today) / 86400000) : null;
        const value = (r.quantity_on_hand || 0) * (r.unit_cost || 0);
        return {
          ...r,
          days_to_expiry:     days,
          inventory_value_aed: Math.round(value * 100) / 100,
          stock_status:
            r.quantity_on_hand === 0              ? 'OUT_OF_STOCK'
            : r.quantity_on_hand <= r.minimum_stock ? 'LOW_STOCK'
            : days !== null && days < 0            ? 'EXPIRED'
            : days !== null && days <= 90          ? 'NEAR_EXPIRY_CRITICAL'
            : days !== null && days <= 180         ? 'NEAR_EXPIRY_WARNING'
            : 'HEALTHY',
        };
      });
    },
  },

  // ── 2. Near Expiry — Critical (≤90 days) ─────────────────────────────────
  {
    id:       'near_expiry_critical',
    filename: `FAL_02_Near_Expiry_Critical_${TODAY}.csv`,
    label:    'Near Expiry Critical — ≤90 days (558 rows)',
    pbi_use:  'CS-1 Near Expiry Case Study · Action Required dashboard tile',
    source:   'inventory WHERE expiry_date ≤ today+90 AND qty > 0',
    async fetch() {
      const d90 = new Date(); d90.setDate(d90.getDate() + 90);
      const { data, error } = await supabase
        .from('inventory')
        .select('id,pharmacy_id,drug_code,batch_number,expiry_date,quantity_on_hand,minimum_stock,unit_cost')
        .gte('expiry_date', new Date().toISOString().split('T')[0])
        .lte('expiry_date', d90.toISOString().split('T')[0])
        .gt('quantity_on_hand', 0)
        .order('expiry_date');
      if (error) throw error;
      const today = new Date();
      return (data||[]).map(r => ({
        ...r,
        days_to_expiry:     Math.round((new Date(r.expiry_date) - today) / 86400000),
        value_at_risk_aed:  Math.round(r.quantity_on_hand * r.unit_cost * 100) / 100,
        tier:               'CRITICAL',
      }));
    },
  },

  // ── 3. Near Expiry — Warning (91–180 days) ────────────────────────────────
  {
    id:       'near_expiry_warning',
    filename: `FAL_03_Near_Expiry_Warning_${TODAY}.csv`,
    label:    'Near Expiry Warning — 91–180 days (2,133 rows)',
    pbi_use:  'CS-1 planning layer · Early warning Power BI tile',
    source:   'inventory WHERE expiry_date 91–180 days AND qty > 0',
    async fetch() {
      const d91  = new Date(); d91.setDate(d91.getDate() + 91);
      const d180 = new Date(); d180.setDate(d180.getDate() + 180);
      const { data, error } = await supabase
        .from('inventory')
        .select('id,pharmacy_id,drug_code,batch_number,expiry_date,quantity_on_hand,minimum_stock,unit_cost')
        .gte('expiry_date', d91.toISOString().split('T')[0])
        .lte('expiry_date', d180.toISOString().split('T')[0])
        .gt('quantity_on_hand', 0)
        .order('expiry_date');
      if (error) throw error;
      const today = new Date();
      return (data||[]).map(r => ({
        ...r,
        days_to_expiry:     Math.round((new Date(r.expiry_date) - today) / 86400000),
        value_at_risk_aed:  Math.round(r.quantity_on_hand * r.unit_cost * 100) / 100,
        tier:               'WARNING',
      }));
    },
  },

  // ── 4. Out of Stock ───────────────────────────────────────────────────────
  {
    id:       'out_of_stock',
    filename: `FAL_04_Out_of_Stock_${TODAY}.csv`,
    label:    'Out of Stock — 8,916 rows',
    pbi_use:  'CS-2 Stock Out Case Study · OOS by pharmacy/drug matrix',
    source:   'vw_out_of_stock_inventory',
    async fetch() {
      const { data, error } = await supabase
        .from('vw_out_of_stock_inventory')
        .select('*')
        .order('pharmacy_id');
      if (error) throw error;
      return data || [];
    },
  },

  // ── 5. Dispensing Activity ────────────────────────────────────────────────
  {
    id:       'dispensing_activity',
    filename: `FAL_05_Dispensing_Activity_${TODAY}.csv`,
    label:    'Dispensing Activity — 40,000 events',
    pbi_use:  'Consumption trend · Weekly/monthly patterns · Top drugs · Patient activity',
    source:   'vw_dispensing_activity',
    async fetch() {
      // Fetch in pages — 40K rows
      const PAGE = 5000;
      let all = [], offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from('vw_dispensing_activity')
          .select('*')
          .range(offset, offset + PAGE - 1)
          .order('created_at');
        if (error) throw error;
        if (!data?.length) break;
        all = all.concat(data);
        offset += PAGE;
        if (data.length < PAGE) break;
        process.stdout.write(`\r    Fetching dispensing: ${all.length.toLocaleString()} rows...`);
      }
      console.log('');
      return all;
    },
  },

  // ── 6. Transfer Activity ──────────────────────────────────────────────────
  {
    id:       'transfer_activity',
    filename: `FAL_06_Transfer_Activity_${TODAY}.csv`,
    label:    'Transfer Activity — 600 rows',
    pbi_use:  'Supply chain flow · NE-driven vs operational transfer analysis',
    source:   'vw_transfer_activity',
    async fetch() {
      const { data, error } = await supabase
        .from('vw_transfer_activity')
        .select('*')
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
  },

  // ── 7. Adjustment Activity ────────────────────────────────────────────────
  {
    id:       'adjustment_activity',
    filename: `FAL_07_Adjustment_Activity_${TODAY}.csv`,
    label:    'Adjustment Activity — 463 rows',
    pbi_use:  'Write-off analysis · Damaged vs expired vs wastage breakdown',
    source:   'vw_adjustment_activity',
    async fetch() {
      const { data, error } = await supabase
        .from('vw_adjustment_activity')
        .select('*')
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
  },

  // ── 8. Top Dispensed Drugs ────────────────────────────────────────────────
  {
    id:       'top_dispensed_drugs',
    filename: `FAL_08_Top_Dispensed_Drugs_${TODAY}.csv`,
    label:    'Top Dispensed Drugs — 8,194 rows',
    pbi_use:  'Drug consumption ranking · ABC analysis input · Formulary review',
    source:   'vw_top_dispensed_drugs',
    async fetch() {
      const { data, error } = await supabase
        .from('vw_top_dispensed_drugs')
        .select('*');
      if (error) throw error;
      return data || [];
    },
  },

  // ── 9. Patient Dispense Activity ──────────────────────────────────────────
  {
    id:       'patient_dispense_activity',
    filename: `FAL_09_Patient_Dispense_Activity_${TODAY}.csv`,
    label:    'Patient Dispense Activity — 40,000 rows',
    pbi_use:  'Patient-level consumption · Insurance breakdown · Pharmacy utilization',
    source:   'vw_patient_dispense_activity',
    async fetch() {
      const PAGE = 5000;
      let all = [], offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from('vw_patient_dispense_activity')
          .select('*')
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        all = all.concat(data);
        offset += PAGE;
        if (data.length < PAGE) break;
        process.stdout.write(`\r    Fetching patient activity: ${all.length.toLocaleString()} rows...`);
      }
      console.log('');
      return all;
    },
  },

  // ── 10. Inventory Value by Pharmacy ──────────────────────────────────────
  {
    id:       'inventory_value_pharmacy',
    filename: `FAL_10_Inventory_Value_by_Pharmacy_${TODAY}.csv`,
    label:    'Inventory Value by Pharmacy — 17 rows',
    pbi_use:  'Financial KPI card · Per-pharmacy value bar chart · Management summary',
    source:   'vw_inventory_value_by_pharmacy',
    async fetch() {
      const { data, error } = await supabase
        .from('vw_inventory_value_by_pharmacy')
        .select('*')
        .order('pharmacy_id');
      if (error) throw error;
      return data || [];
    },
  },

  // ── 11. Stock Count Items Detail ─────────────────────────────────────────
  {
    id:       'stock_count_detail',
    filename: `FAL_11_Stock_Count_Items_Detail_${TODAY}.csv`,
    label:    'Stock Count Items Detail — 47,652 rows',
    pbi_use:  'CS-3 Reconciliation · Variance analysis · Session comparison across cycles',
    source:   'vw_stock_count_items_detail',
    async fetch() {
      const PAGE = 5000;
      let all = [], offset = 0;
      while (true) {
        const { data, error } = await supabase
          .from('vw_stock_count_items_detail')
          .select('*')
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        all = all.concat(data);
        offset += PAGE;
        if (data.length < PAGE) break;
        process.stdout.write(`\r    Fetching stock count: ${all.length.toLocaleString()} rows...`);
      }
      console.log('');
      return all;
    },
  },

  // ── 12. Reconciliation Cases ─────────────────────────────────────────────
  {
    id:       'reconciliation_cases',
    filename: `FAL_12_Reconciliation_Cases_${TODAY}.csv`,
    label:    'Reconciliation Cases — 4,561 rows',
    pbi_use:  'CS-3 Reconciliation workflow · Status funnel · Reason code breakdown',
    source:   'reconciliation_cases',
    async fetch() {
      const { data, error } = await supabase
        .from('reconciliation_cases')
        .select('id,pharmacy_id,drug_code,batch_number,system_quantity,counted_quantity,variance,variance_type,reason,status,resolved_by,resolved_at,created_at')
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
  },

  // ── 13. Pharmacy Master ───────────────────────────────────────────────────
  {
    id:       'pharmacy_master',
    filename: `FAL_13_Pharmacy_Master_${TODAY}.csv`,
    label:    'Pharmacy Master — 17 rows',
    pbi_use:  'Lookup table · Slicer for all other reports · Pharmacy type filter',
    source:   'pharmacies',
    async fetch() {
      const { data, error } = await supabase
        .from('pharmacies')
        .select('*')
        .order('id');
      if (error) throw error;
      return data || [];
    },
  },

  // ── 14. Drug Master Reference ─────────────────────────────────────────────
  {
    id:       'drug_master',
    filename: `FAL_14_Drug_Master_Reference_${TODAY}.csv`,
    label:    'Drug Master Reference — active drugs',
    pbi_use:  'Drug lookup · Insurance flags · Price reference · Category slicer',
    source:   'drug_master_reference WHERE is_active = true',
    async fetch() {
      const { data, error } = await supabase
        .from('drug_master_reference')
        .select('drug_code,generic_name,brand_name,strength,dosage_form,manufacturer,unit_price_to_pharmacy,unit_price_to_public,insurance_basic,insurance_thiqa,upp_scope,is_controlled,is_narcotic,is_combination,primary_ingredient')
        .eq('is_active', true)
        .order('drug_code');
      if (error) throw error;
      return data || [];
    },
  },

];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const filterArg = process.argv.find(a => a.startsWith('--view='))?.split('=')[1];
  const toRun     = filterArg
    ? EXPORTS.filter(e => e.id === filterArg)
    : EXPORTS;

  if (toRun.length === 0) {
    console.error(`\n  No export found with id: ${filterArg}`);
    console.error('  Available:', EXPORTS.map(e=>e.id).join(', '), '\n');
    process.exit(1);
  }

  console.log('\n  FalconMed v3 — Phase 8.2 Power BI Export');
  console.log(`  ${new Date().toISOString()}`);
  console.log(`  Output folder: ${EXPORT_DIR}\n`);
  printLine('=');

  let totalRows = 0, totalFiles = 0;

  for (const exp of toRun) {
    process.stdout.write(`  Exporting ${exp.label}...`);
    try {
      const rows = await exp.fetch();
      const filepath = writeCSV(exp.filename, rows);
      const kb = Math.round(fs.statSync(filepath).size / 1024);
      console.log(`\r  OK   ${exp.filename.padEnd(55)} ${rows.length.toLocaleString().padStart(7)} rows  ${kb}KB`);
      totalRows  += rows.length;
      totalFiles++;
    } catch (err) {
      console.error(`\r  FAIL ${exp.filename} — ${err.message}`);
    }
  }

  printLine('=');
  console.log(`\n  Export complete.`);
  console.log(`  Files   : ${totalFiles} / ${toRun.length}`);
  console.log(`  Rows    : ${totalRows.toLocaleString()}`);
  console.log(`  Folder  : ${EXPORT_DIR}`);
  console.log('\n  Open Power BI Desktop → Get Data → Text/CSV → select any FAL_*.csv');
  console.log('  Use FAL_13 (Pharmacy Master) and FAL_14 (Drug Master) as lookup tables.\n');
  printLine('=');

  process.exit(0);
}

main().catch(err => {
  console.error('\n  Unexpected error:', err.message);
  process.exit(1);
});
