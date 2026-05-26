# FalconMed v3 Architecture

## Core Principles

- Ledger-first architecture
- Batch-aware inventory
- ID-based relationships only
- Supabase persisted operations
- No demo/live mixing
- No direct inventory edits
- No text-name matching
- DOH master remains raw and untouched

---

## Core Foundation

FalconMed v3 is a clean operational rebuild designed for pharmacy inventory, dispensing, transfers, stocktaking, and reconciliation.

The system uses:
- React + Vite frontend
- Supabase backend
- Movement ledger architecture
- Batch-based inventory tracking

---

## Operational Philosophy

Every inventory change must:
1. Persist to Supabase
2. Generate a stock movement
3. Generate an audit log
4. Preserve batch traceability

No operational action should bypass the movement ledger.

---

## Planned Phases

### Phase 0
Architecture + data contracts + schema planning

### Phase 1
Read-only inventory foundation

### Phase 2
Single pharmacy inventory validation

### Phase 3
Dispensing core

### Phase 4
Inter-pharmacy transfers

### Phase 5
Patient registry + dispense history

### Phase 6
Stocktaking

### Phase 7
Recon engine

### Phase 8
SaaS onboarding + subscriptions