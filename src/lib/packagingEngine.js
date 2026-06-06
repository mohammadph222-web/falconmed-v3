export function parsePackageSize(packageSize) {
  if (!packageSize) {
    return {
      raw: null,
      unitCount: null,
      confidence: 'missing',
      interpretation: 'No package size provided',
    }
  }

  const raw = String(packageSize)
  const text = raw.toLowerCase().trim()

  const leadingUnitMatch = text.match(/^(\d+(\.\d+)?)\s*'?s?\b/)

  if (leadingUnitMatch) {
    return {
      raw,
      unitCount: Number(leadingUnitMatch[1]),
      confidence: 'high',
      interpretation: 'Leading package quantity detected',
    }
  }

  const explicitUnitMatch = text.match(
    /(\d+(\.\d+)?)\s*(tablet|tablets|capsule|capsules|caplet|caplets|ampoule|ampoules|vial|vials|syringe|syringes|patch|patches|suppository|suppositories)\b/
  )

  if (explicitUnitMatch) {
    return {
      raw,
      unitCount: Number(explicitUnitMatch[1]),
      confidence: 'high',
      interpretation: 'Explicit unit quantity detected',
    }
  }

  const multiplicationMatch = text.match(
    /(\d+(\.\d+)?)\s*(x|\*)\s*(\d+(\.\d+)?)/
  )

  if (multiplicationMatch) {
    return {
      raw,
      unitCount:
        Number(multiplicationMatch[1]) *
        Number(multiplicationMatch[4]),
      confidence: 'medium',
      interpretation: 'Multiplication pattern detected',
    }
  }

  const firstNumberMatch = text.match(/\d+(\.\d+)?/)

  if (firstNumberMatch) {
    return {
      raw,
      unitCount: Number(firstNumberMatch[0]),
      confidence: 'low',
      interpretation: 'Fallback first number used',
    }
  }

  return {
    raw,
    unitCount: null,
    confidence: 'unknown',
    interpretation: 'Unable to parse package size',
  }
}

export function calculateUnitPrice(packagePrice, packageSize) {
  const parsed = parsePackageSize(packageSize)

  if (!packagePrice || !parsed.unitCount) {
    return null
  }

  return Number(packagePrice) / parsed.unitCount
}

export function convertPacksToUnits(packs, packageSize) {
  const parsed = parsePackageSize(packageSize)

  if (!packs || !parsed.unitCount) {
    return null
  }

  return Number(packs) * parsed.unitCount
}

export function convertUnitsToPacks(units, packageSize) {
  const parsed = parsePackageSize(packageSize)

  if (!units || !parsed.unitCount) {
    return null
  }

  return Number(units) / parsed.unitCount
}