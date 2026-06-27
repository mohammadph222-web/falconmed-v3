# FalconMed v3 — GitHub Setup Instructions

## Steps to publish the repository

### 1. Create the GitHub repository

1. Go to github.com → New repository
2. Name: `falconmed-v3`
3. Description: `Pharmacy Operations Analytics Platform — Educational pharmacy informatics portfolio with real UAE hospital data, Power BI case studies, and clinical inventory management scenarios.`
4. Visibility: Public
5. Do NOT initialise with README (we have our own)

### 2. Prepare your local project

```bash
cd falconmed-v3
git init
git add .
git commit -m "feat: FalconMed v3 Foundation — initial release"
```

### 3. Add the remote and push

```bash
git remote add origin https://github.com/YOUR_USERNAME/falconmed-v3.git
git branch -M main
git push -u origin main
```

### 4. Files to exclude before pushing

The `.gitignore` already excludes:
- `node_modules/`
- `.env` files
- `src/lib/supabase.js` (contains real credentials)
- Raw source `.xlsx` and `.csv` data files

Before pushing, verify `src/lib/supabase.js` is NOT tracked:
```bash
git status
# Should not show src/lib/supabase.js
```

### 5. Add the supabase template

Copy `supabase.template.js` to `src/lib/` and rename. Push the template (not the real credentials).

### 6. Recommended GitHub repository settings

- Add topics: `pharmacy`, `react`, `supabase`, `power-bi`, `healthcare-analytics`, `inventory-management`, `uae`, `pharmacy-informatics`
- Set Description as above
- Add website link when LinkedIn article is published

### 7. First commit message convention

```
feat: FalconMed v3 Foundation — initial release

- 19-pharmacy network with 23,151 inventory records
- Dataset governance certified (100% field completeness)
- Executive Dashboard with near-expiry financial KPIs
- Full pharmacy operations workflow (dispense, transfer, stock count, reconciliation)
- Professional CSV/Excel export with 6 quality fixes
- Complete technical documentation in /docs
```

---

## Repository structure after push

```
falconmed-v3/
├── README.md              ← Professional project overview
├── .gitignore
├── supabase.template.js   ← Safe template (no real credentials)
├── package.json
├── vite.config.js
├── index.html
├── src/
│   ├── App.jsx
│   ├── styles/
│   └── pages/
└── docs/
    ├── README.md
    ├── 01_architecture_overview.md
    ├── 02_database_design.md
    ├── 03_business_rules.md
    ├── 04_kpi_definitions.md
    ├── 05_data_dictionary.md
    ├── 06_roadmap.md
    └── 07_case_study_framework.md
```
