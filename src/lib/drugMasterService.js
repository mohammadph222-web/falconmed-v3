import { buildDrugIntelligence } from './drugIntelligenceEngine'
import { supabase } from './supabase'

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
}

function isCombinationDrug(name = '') {
  const value = normalizeText(name)

  return (
    value.includes(',') ||
    value.includes('+') ||
    value.includes('/') ||
    value.includes(' and ') ||
    value.includes(' with ')
  )
}

function hasUpp(drug) {
  const value = normalizeText(drug.upp_scope)

  return (
    value === 'yes' ||
    value === 'y' ||
    value === 'true' ||
    value === '1' ||
    value.includes('yes') ||
    value.includes('upp')
  )
}

function scoreDrug(drug, term, mode) {
  const generic = normalizeText(drug.generic_name)
  const brand = normalizeText(drug.brand_name)
  const code = normalizeText(drug.drug_code)
  const search = normalizeText(term)

  let score = 0

  if (mode === 'generic') {
    if (generic === search) score += 120
    if (generic.startsWith(search)) score += 80
    if (!isCombinationDrug(generic)) score += 40
    if (generic.includes(search)) score += 20
  }

  if (mode === 'brand') {
    if (brand === search) score += 120
    if (brand.startsWith(search)) score += 80
    if (brand.includes(search)) score += 20
  }

  if (mode === 'code') {
    if (code === search) score += 120
    if (code.startsWith(search)) score += 80
    if (code.includes(search)) score += 20
  }

  if (mode === 'all') {
    if (generic === search || brand === search || code === search) score += 120
    if (generic.startsWith(search) || brand.startsWith(search) || code.startsWith(search)) score += 80
    if (!isCombinationDrug(generic)) score += 40
    if (generic.includes(search) || brand.includes(search) || code.includes(search)) score += 20
  }

  return score
}

export async function searchDrugs(searchTerm, filters = {}) {
  if (!searchTerm || searchTerm.trim().length < 2) return []

  const cleaned = searchTerm.trim()
  const mode = filters.searchMode || 'all'

  let query = supabase
    .from('drug_master_reference')
    .select('*')

  if (filters.activeOnly) {
    query = query.eq('is_active', true)
  }

  if (filters.basicOnly) {
    query = query.eq('insurance_basic', true)
  }

  if (filters.thiqaOnly) {
    query = query.eq('insurance_thiqa', true)
  }

  if (filters.uppOnly) {
    query = query.or(
      'upp_scope.ilike.%yes%,upp_scope.ilike.%upp%,upp_scope.eq.true,upp_scope.eq.1'
    )
  }

  if (mode === 'generic') {
    query = query.ilike('generic_name', `%${cleaned}%`)
  } else if (mode === 'brand') {
    query = query.ilike('brand_name', `%${cleaned}%`)
  } else if (mode === 'code') {
    query = query.ilike('drug_code', `%${cleaned}%`)
  } else {
    query = query.or(
      `generic_name.ilike.%${cleaned}%,brand_name.ilike.%${cleaned}%,package_name.ilike.%${cleaned}%,drug_code.ilike.%${cleaned}%`
    )
  }

  const { data, error } = await query.limit(200)

  if (error) {
    console.error('Drug search error:', error)
    return []
  }

 
 let results = (data || []).map(buildDrugIntelligence)




if (filters.singleIngredientOnly) {
  results = results.filter((drug) => !drug.is_combination)
}


if (filters.combinationOnly) {
  results = results.filter((drug) => drug.is_combination)
}

if (filters.uppOnly) {
  results = results.filter((drug) => hasUpp(drug))
}
  return results.sort((a, b) => {
    return scoreDrug(b, cleaned, mode) - scoreDrug(a, cleaned, mode)
  })
}