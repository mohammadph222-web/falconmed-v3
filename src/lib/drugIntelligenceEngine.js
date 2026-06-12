export function normalizeDrugText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const COMBINATION_SEPARATORS = ['+', ',', '/', ' and ', ' with ']

const SALT_FORMS = [
  'besilate',
  'maleate',
  'mesylate',
  'hydrochloride',
  'hcl',
  'sodium',
  'potassium',
  'calcium',
  'magnesium',
  'phosphate',
  'sulfate',
  'sulphate',
  'nitrate',
  'tartrate',
  'succinate',
  'fumarate',
  'citrate',
  'lactate',
  'acetate',
  'bromide',
  'chloride',
  'tosylate',
  'napsylate',
  'malate',
  'benzoate',
  'dipropionate',
  'propionate',
  'palmitate',
]

export function isCombinationDrug(name = '') {
  const value = normalizeDrugText(name)

  return COMBINATION_SEPARATORS.some((separator) =>
    value.includes(separator)
  )
}

export function splitIngredients(genericName = '') {
  let value = normalizeDrugText(genericName)

  value = value
    .replace(/\s*\+\s*/g, '|')
    .replace(/\s*,\s*/g, '|')
    .replace(/\s*\/\s*/g, '|')
    .replace(/\s+and\s+/g, '|')
    .replace(/\s+with\s+/g, '|')

  return value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function detectSaltForm(ingredientName = '') {
  const words = normalizeDrugText(ingredientName).split(' ')
  const lastWord = words[words.length - 1]

  if (SALT_FORMS.includes(lastWord)) {
    return lastWord
  }

  return null
}

export function parseIngredient(ingredientName = '') {
  const value = normalizeDrugText(ingredientName)
  const saltForm = detectSaltForm(value)

  if (!saltForm) {
    return {
      ingredient: value,
      salt_form: null,
    }
  }

  const ingredient = value
    .split(' ')
    .filter((word) => word !== saltForm)
    .join(' ')
    .trim()

  return {
    ingredient,
    salt_form: saltForm,
  }
}

export function buildDrugIntelligence(drug = {}) {
  const rawGeneric = drug.generic_name || ''
  const rawBrand = drug.brand_name || ''

  const rawIngredients = splitIngredients(rawGeneric)
  const parsedIngredients = rawIngredients.map(parseIngredient)

  const ingredientList = parsedIngredients
    .map((item) => item.ingredient)
    .filter(Boolean)

  const primaryIngredient = ingredientList[0] || normalizeDrugText(rawGeneric)

  const saltForm =
    parsedIngredients.length === 1
      ? parsedIngredients[0]?.salt_form || null
      : null

  return {
    ...drug,
    normalized_generic_name: normalizeDrugText(rawGeneric),
    normalized_brand_name: normalizeDrugText(rawBrand),
    ingredient_list: ingredientList,
    ingredient_count: ingredientList.length,
    primary_ingredient: primaryIngredient,
    salt_form: saltForm,
    is_combination: ingredientList.length > 1,
  }
}