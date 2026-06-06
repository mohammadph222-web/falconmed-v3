import {
  parsePackageSize,
  calculateUnitPrice,
  convertPacksToUnits,
  convertUnitsToPacks,
} from '../../src/lib/packagingEngine.js'

const examples = [
  {
    packageSize: "30's (10's Blister x 3)",
    price: 280,
    packs: 2,
    units: 60,
  },
  {
    packageSize: '28 tablets',
    price: 56,
    packs: 1,
    units: 14,
  },
  {
    packageSize: '10 x 10 tablets',
    price: 100,
    packs: 1,
    units: 50,
  },
  {
    packageSize: '5 ampoules',
    price: 25,
    packs: 3,
    units: 10,
  },
]

for (const item of examples) {
  const parsed = parsePackageSize(item.packageSize)

  console.log('---')
  console.log('Package:', item.packageSize)
  console.log('Detected units:', parsed.unitCount)
  console.log('Confidence:', parsed.confidence)
  console.log('Interpretation:', parsed.interpretation)
  console.log('Unit price:', calculateUnitPrice(item.price, item.packageSize))
  console.log(`${item.packs} packs =`, convertPacksToUnits(item.packs, item.packageSize), 'units')
  console.log(`${item.units} units =`, convertUnitsToPacks(item.units, item.packageSize), 'packs')
}