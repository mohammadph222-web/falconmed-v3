/**
 * FalconMed Simulator v1 — Module B Cleanup
 * File: scripts/simulation/cleanup_module_b.js
 *
 * PURPOSE:
 *   Safely removes ONLY simulation rows inserted by seed_module_b.js.
 *   Identified by: batch_number LIKE 'SIM-B-%'
 *   Original inventory rows (batch_number NOT LIKE 'SIM-B-%') are never touched.
 *
 * RULES:
 *   - Shows exact count of rows to be deleted before any action
 *   - Requires typing YES to confirm
 *   - Deletes ONLY WHERE batch_number LIKE 'SIM-B-%'
 *   - Validates row count after deletion
 *   - Append-only rule does not apply here — this is an explicit cleanup tool
 *
 * RUN:
 *   node scripts/simulation/cleanup_module_b.js
 *   node scripts/simulation/cleanup_module_b.js --dry-run
 */

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// ─── Supabase Client ──────────────────────────────────────────────────────────

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌  Missing environment variables.');
  console.error('    SUPABASE_URL=https://your-project.supabase.co');
  console.error('    SUPABASE_SERVICE_ROLE_KEY=your-service-role-key\n');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const SIM_PREFIX  = 'SIM-B';
const MATCH_GLOB  = `${SIM_PREFIX}-%`;
const DRY_RUN     = process.argv.includes('--dry-run');

function printLine(char = '─', len = 70) {
  console.log(char.repeat(len));
}

// ─── Step 1: Count rows to be deleted ────────────────────────────────────────

async function countSimRows() {
  const { count, error } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .like('batch_number', MATCH_GLOB);

  if (error) throw new Error(`Count query failed: ${error.message}`);
  return count || 0;
}

// ─── Step 2: Count original rows (must not change) ───────────────────────────

async function countOriginalRows() {
  const { count, error } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .not('batch_number', 'like', MATCH_GLOB);

  if (error) throw new Error(`Original row count failed: ${error.message}`);
  return count || 0;
}

async function countTotalRows() {
  const { count, error } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true });

  if (error) throw new Error(`Total count query failed: ${error.message}`);
  return count || 0;
}

// ─── Step 3: Confirm prompt ───────────────────────────────────────────────────

async function confirmDelete(simCount) {
  if (DRY_RUN) {
    console.log('\n  🔍  DRY RUN — no rows will be deleted.\n');
    return false;
  }

  console.log('\n  ┌─────────────────────────────────────────────────────┐');
  console.log(`  │  ⚠   You are about to delete ${String(simCount).padEnd(6)} inventory rows.  │`);
  console.log('  │      Only SIM-B-* batch_number rows will be removed. │');
  console.log('  │      Original inventory rows will NOT be touched.    │');
  console.log('  └─────────────────────────────────────────────────────┘');

  return new Promise(resolve => {
    process.stdout.write('\n  ❓  Type YES to confirm deletion: ');
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', input => {
      resolve(input.trim().toUpperCase() === 'YES');
    });
  });
}

// ─── Step 4: Delete in batches ───────────────────────────────────────────────
// Supabase does not support LIMIT on DELETE directly.
// Strategy: fetch IDs in pages, delete by ID list — safe and auditable.

async function deleteSimRows(totalToDelete) {
  const PAGE_SIZE   = 500;
  let   totalDeleted = 0;

  console.log(`\n  Deleting ${totalToDelete.toLocaleString()} rows in pages of ${PAGE_SIZE}...`);

  while (true) {
    // Fetch a page of IDs matching SIM-B prefix
    const { data: page, error: fetchErr } = await supabase
      .from('inventory')
      .select('id')
      .like('batch_number', MATCH_GLOB)
      .limit(PAGE_SIZE);

    if (fetchErr) throw new Error(`Fetch page failed: ${fetchErr.message}`);
    if (!page || page.length === 0) break;  // nothing left

    const ids = page.map(r => r.id);

    const { error: delErr } = await supabase
      .from('inventory')
      .delete()
      .in('id', ids);

    if (delErr) throw new Error(`Delete batch failed: ${delErr.message}`);

    totalDeleted += ids.length;
    process.stdout.write(`\r  Deleted ${totalDeleted.toLocaleString()} / ${totalToDelete.toLocaleString()} rows...`);
  }

  console.log('\n');
  return totalDeleted;
}

// ─── Step 5: Post-delete validation ──────────────────────────────────────────

async function validatePostDelete(preSimCount, preOriginalCount) {
  const postSimCount      = await countSimRows();
  const postOriginalCount = await countOriginalRows();
  const postTotal         = await countTotalRows();

  console.log('  📊  POST-DELETE VALIDATION');
  printLine();

  // SIM-B rows
  if (postSimCount === 0) {
    console.log(`  ✓  SIM-B rows remaining     : 0 — all simulation rows removed`);
  } else {
    console.warn(`  ⚠  SIM-B rows remaining     : ${postSimCount.toLocaleString()} — some rows not deleted`);
  }

  // Original rows — must be unchanged
  if (postOriginalCount === preOriginalCount) {
    console.log(`  ✓  Original rows unchanged  : ${postOriginalCount.toLocaleString()} rows intact`);
  } else {
    console.error(`  ❌  Original row count changed!`);
    console.error(`      Before: ${preOriginalCount.toLocaleString()}  After: ${postOriginalCount.toLocaleString()}`);
    console.error(`      INVESTIGATE IMMEDIATELY — original data may have been affected.`);
    process.exit(1);
  }

  console.log(`  ✓  Total inventory rows now : ${postTotal.toLocaleString()}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  FalconMed Simulator v1 — Module B Cleanup');
  console.log(`  ${new Date().toISOString()}\n`);

  printLine('═');
  console.log('  CLEANUP SCOPE: inventory WHERE batch_number LIKE \'SIM-B-%\'');
  console.log('  PROTECTED:     inventory WHERE batch_number NOT LIKE \'SIM-B-%\'');
  printLine('═');

  // ── Count before any action ──────────────────────────────────────────────
  let simCount, originalCount, totalCount;
  try {
    console.log('\n  Counting rows...');
    simCount      = await countSimRows();
    originalCount = await countOriginalRows();
    totalCount    = await countTotalRows();
  } catch (err) {
    console.error(`\n  ❌  Count failed: ${err.message}`);
    process.exit(1);
  }

  console.log('\n  📊  CURRENT INVENTORY STATE');
  printLine();
  console.log(`  Total inventory rows      : ${totalCount.toLocaleString()}`);
  console.log(`  ├─ SIM-B rows (to delete) : ${simCount.toLocaleString()}`);
  console.log(`  └─ Original rows (kept)   : ${originalCount.toLocaleString()}`);
  console.log(`\n  After cleanup expected    : ${originalCount.toLocaleString()} rows`);

  if (simCount === 0) {
    console.log('\n  ✓  No SIM-B rows found. Nothing to delete.\n');
    process.exit(0);
  }

  // ── Confirm ──────────────────────────────────────────────────────────────
  const confirmed = await confirmDelete(simCount);
  if (!confirmed) {
    console.log('\n  ⛔  Aborted. No rows deleted.\n');
    process.exit(0);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  let deleted;
  try {
    deleted = await deleteSimRows(simCount);
  } catch (err) {
    console.error(`\n  ❌  Deletion failed: ${err.message}`);
    console.error('      Run cleanup again — it will remove any remaining SIM-B rows.');
    process.exit(1);
  }

  // ── Validate ─────────────────────────────────────────────────────────────
  await validatePostDelete(simCount, originalCount);

  // ── Summary ───────────────────────────────────────────────────────────────
  printLine('═');
  console.log('\n  ✅  CLEANUP COMPLETE\n');
  console.log(`  Rows deleted     : ${deleted.toLocaleString()}`);
  console.log(`  Original rows    : ${originalCount.toLocaleString()} — untouched`);
  console.log('\n  Ready to run corrected seed:');
  console.log('  node scripts/simulation/seed_module_b.js --dry-run\n');
  printLine('═');

  process.exit(0);
}

main().catch(err => {
  console.error('\n  ❌  Unexpected error:', err.message);
  process.exit(1);
});
