import { readFileSync } from 'node:fs'

import {
  DISCOUNT_NOTE_EXTRA_KEY,
  WEDDING_FORMULAS,
  WEDDING_TIMING_NOTICE,
  getExpandedWeddingFormulaIncludes,
  getWeddingFormulaFromExtraPrices,
  parseExtraPrices,
  selectMinimumWeddingFormula,
  selectWeddingFormula,
  stringifyExtraPrices,
} from '../src/config/weddingFormulas'

const expected = [
  ['avondfeest', 'Aanwezig vanaf het hoofdgerecht', 850],
  ['receptie_avondfeest', 'Aanwezig vanaf de receptie', 950],
  ['ceremonie_receptie_avondfeest', 'Aanwezig vanaf de ceremonie', 1200],
] as const

for (const [key, arrivalMoment, price] of expected) {
  const formula = WEDDING_FORMULAS.find(item => item.key === key)
  if (!formula || formula.arrivalMoment !== arrivalMoment || formula.price !== price) {
    throw new Error(`Onjuiste trouwformule: ${key}`)
  }
}

if (!WEDDING_TIMING_NOTICE.includes('+ € 100') || !WEDDING_TIMING_NOTICE.includes('+ € 350')) {
  throw new Error('De formuleclausule mist een prijsverschil.')
}

const discountReason = 'De zaal voorziet de geluids- en lichtinstallatie.'
const stored = stringifyExtraPrices({
  _trouw_formule: 'avondfeest',
  _korting: '125',
  [DISCOUNT_NOTE_EXTRA_KEY]: discountReason,
})
const parsed = parseExtraPrices(stored)
const formula = getWeddingFormulaFromExtraPrices(stored)

if (parsed[DISCOUNT_NOTE_EXTRA_KEY] !== discountReason || formula?.key !== 'avondfeest') {
  throw new Error('De kortingsuitleg of trouwformule blijft niet correct bewaard.')
}

const ceremonyUpgrade = selectWeddingFormula(stringifyExtraPrices({
  _trouw_formule: 'receptie_avondfeest',
  ceremonie_set: 250,
  digital_booth: 175,
}), 'ceremonie_receptie_avondfeest')
const ceremonyPrices = parseExtraPrices(ceremonyUpgrade.extra_prijzen)
if (
  ceremonyUpgrade.basisprijs !== 1200 ||
  ceremonyUpgrade.ceremonie_set !== 0 ||
  ceremonyPrices.ceremonie_set !== undefined ||
  Number(ceremonyPrices.digital_booth) !== 175
) {
  throw new Error('De ceremoniekeuze wordt niet correct naar de volledige formule omgezet.')
}

const entranceUpgrade = selectMinimumWeddingFormula(
  stringifyExtraPrices({ _trouw_formule: 'avondfeest', _korting: 50 }),
  'receptie_avondfeest',
)
if (
  entranceUpgrade.formula.key !== 'receptie_avondfeest' ||
  entranceUpgrade.basisprijs !== 950 ||
  Number(parseExtraPrices(entranceUpgrade.extra_prijzen)._korting) !== 50
) {
  throw new Error('Een zaalintrede schakelt niet correct naar Receptie + avondfeest.')
}

const fullPackagePreserved = selectMinimumWeddingFormula(
  stringifyExtraPrices({ _trouw_formule: 'ceremonie_receptie_avondfeest' }),
  'receptie_avondfeest',
)
if (fullPackagePreserved.formula.key !== 'ceremonie_receptie_avondfeest' || fullPackagePreserved.basisprijs !== 1200) {
  throw new Error('Een zaalintrede mag de volledige ceremonieformule niet verlagen.')
}

const receptionFormula = WEDDING_FORMULAS.find(item => item.key === 'receptie_avondfeest')!
const expandedReceptionIncludes = getExpandedWeddingFormulaIncludes(receptionFormula)
for (const requiredItem of [
  'Professionele geluids- en lichtinstallatie',
  'Sfeerverlichting (uplights)',
  'Opbouw en afbraak',
  'DJ zonder vaste eindtijd',
  'Achtergrondmuziek tijdens de receptie',
  'Draadloze microfoon voor speeches en aankondigingen',
]) {
  if (!expandedReceptionIncludes.includes(requiredItem)) throw new Error(`De contractinhoud mist: ${requiredItem}`)
}
if (expandedReceptionIncludes.some(item => item.toLowerCase().includes('alles van het avondfeest'))) {
  throw new Error('Het contract mag niet enkel verwijzen naar alles van het avondfeest.')
}

const contractPdfSource = readFileSync(new URL('../src/lib/contractPDF.ts', import.meta.url), 'utf8')
for (const removedText of ['Wijzigingen & mogelijke meerkost', 'WEDDING_TIMING_NOTICE', 'Trouwformule - ${formule.label}']) {
  if (contractPdfSource.includes(removedText)) throw new Error(`Verouderde contracttekst staat nog in het contract: ${removedText}`)
}
for (const requiredText of ['Trouwformule: ${formule.label}', 'INBEGREPEN IN DE TROUWFORMULE', 'fontSize: 8.25']) {
  if (!contractPdfSource.includes(requiredText)) throw new Error(`De verbeterde contractopmaak mist: ${requiredText}`)
}

console.log(JSON.stringify({ success: true, formulas: expected.length, discountReason: true, packageUpgrades: true, expandedReceptionPackage: true, removedCostNotice: true }, null, 2))
