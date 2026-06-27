# FalconMed v3 — Pharmacy Operations Analytics Platform

> A professional pharmacy informatics portfolio project demonstrating inventory management, data governance, and analytical case studies using real UAE pharmacy data.

---

## Overview

FalconMed v3 is an educational pharmacy analytics platform built to simulate and analyse real-world pharmacy inventory management scenarios. It is used for:

- **Pharmacy informatics education** — realistic inventory data, clinical scenarios, and operational workflows
- **Power BI case studies** — structured analytical investigations with published findings
- **Professional portfolio** — demonstrating pharmacy informatics competency for LinkedIn and employer demonstrations

FalconMed is not a clinical production system. It is an educational platform built on real pharmacy stock data and realistic simulation data.

---

## Live Platform

> Built with React 19 + Vite + Supabase PostgreSQL

**Key capabilities:**
- Executive Dashboard with real-time inventory health monitoring
- Drug search across a 22,940-drug UAE DOH reference database
- Inventory Explorer with professional CSV/Excel export
- Near-expiry risk analytics with financial exposure quantification
- Stock count and reconciliation workflow
- File comparison engine for stock reconciliation
- Negative stock guard — no inventory record can go below zero

---

## Dataset

| Metric | Value |
|---|---|
| Pharmacy network | 19 pharmacies |
| Total inventory records | 23,151 |
| Educational pharmacies | 2 (real data from UAE hospital) |
| Simulated pharmacies | 17 |
| Drug Master Reference | 22,940 drugs (UAE DOH) |
| Total inventory value | AED ~30.6M |
| Data governance | Certified — 100% field completeness across 9 fields |

### Pharmacy Network

| Type | Count | Examples |
|---|---|---|
| Inpatient | 4 | ICU, OR, Main, Emergency |
| Outpatient | 1 | Educational (real data) |
| Retail | 5 | FRN branches across UAE |
| Specialty | 4 | Oncology, Dialysis, Cardiology, Day Surgery |
| Other | 5 | Ambulatory, Pediatric, ER branches |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 8 |
| Database | PostgreSQL via Supabase |
| Styling | CSS custom properties (token system) |
| Export | SheetJS (xlsx) |
| Analytics | Power BI (case studies) |

---

## Project Structure

```
falconmed-v3/
├── src/
│   ├── App.jsx                        # Navigation and routing
│   ├── lib/supabase.js                # Database client
│   ├── styles/
│   │   ├── tokens.css                 # Design tokens
│   │   ├── layout.css                 # App shell
│   │   └── components.css             # Component styles
│   └── pages/
│       ├── DashboardPage.jsx          # Executive Dashboard
│       ├── DrugSearchPage.jsx         # Drug reference search
│       ├── InventoryExplorerPage.jsx  # Pharmacy inventory table
│       ├── InventoryIntelligencePage.jsx  # Risk analytics
│       ├── InventoryOperationsPage.jsx    # Adjustments, dispense, transfer
│       ├── StockCountPage.jsx         # Stock count sessions
│       ├── ReconciliationCasesPage.jsx    # Variance investigation
│       ├── ReconciliationAuditPage.jsx    # Audit trail
│       └── ReconCompareEngine.jsx     # File comparison tool
├── docs/
│   ├── 01_architecture_overview.md
│   ├── 02_database_design.md
│   ├── 03_business_rules.md
│   ├── 04_kpi_definitions.md
│   ├── 05_data_dictionary.md
│   ├── 06_roadmap.md
│   └── 07_case_study_framework.md
└── README.md
```

---

## Data Governance

FalconMed completed a full 7-checkpoint dataset governance sprint in June 2026.

| Checkpoint | Description | Result |
|---|---|---|
| CP0 | Source integrity — row counts, duplicates, nulls | ✅ PASS |
| CP1 | Drug mapping — DOH code match rate | ✅ PASS |
| CP2 | Unit cost coverage | ✅ PASS |
| CP3 | Expiry date distribution vs scenario targets | ✅ PASS |
| CP4 | Storage location completeness | ✅ PASS |
| CP5 | Min/max stock logic validation | ✅ PASS |
| CP6 | Inventory status consistency | ✅ PASS |
| CP7 | Full field completeness certificate | ✅ 100% — all 19 pharmacies |

---

## Case Studies

Each case study follows a structured six-step analytical process:

1. Executive Dashboard identifies the highest financial risk
2. Drill down into that pharmacy
3. Identify the specific drugs driving the risk
4. Analyse the root cause
5. Propose corrective actions
6. Measure the expected financial improvement

| Case Study | Topic | Status |
|---|---|---|
| CS-001 | Near Expiry Risk Analysis | 🔄 In progress |
| CS-002 | Stock Shortage Analysis | 🔮 Planned |
| CS-003 | Inventory Value and ABC Analysis | 🔮 Planned |
| CS-004 | Reconciliation Performance | 🔮 Planned |

---

## Documentation

Full technical documentation is available in the [`/docs`](./docs/) folder:

- [Architecture Overview](./docs/01_architecture_overview.md)
- [Database Design](./docs/02_database_design.md)
- [Business Rules](./docs/03_business_rules.md)
- [KPI Definitions](./docs/04_kpi_definitions.md)
- [Data Dictionary](./docs/05_data_dictionary.md)
- [Roadmap](./docs/06_roadmap.md)
- [Case Study Framework](./docs/07_case_study_framework.md)

---

## Known Limitations

| Limitation | Status |
|---|---|
| Inpatient drug names show SAP codes instead of generic names | ⏸ Deferred — awaiting master warehouse mapping file. SQL view and mapping table are ready to deploy. |
| No React Router (deep-linking not supported) | Documented — future enhancement |
| No automated tests | Documented — future enhancement |

---

## About

Built by a clinical pharmacist with hands-on experience across inpatient, outpatient, ICU, emergency, oncology, and community pharmacy settings in the UAE.

FalconMed demonstrates the intersection of clinical pharmacy expertise and data analytics — showing that pharmacy informatics is not just a technical discipline but a clinical one.

---

## License

This project is for educational and portfolio demonstration purposes.  
Real pharmacy data has been anonymised and used with appropriate permissions.
