import { Booking } from '../types/booking'

export type WeddingFormulaKey = 'avondfeest' | 'receptie_avondfeest' | 'ceremonie_receptie_avondfeest'

export type WeddingFormula = {
  key: WeddingFormulaKey
  label: string
  shortLabel: string
  price: number
  emoji: string
  arrivalMoment: string
  includes: string[]
}

export const WEDDING_FORMULA_EXTRA_KEY = '_trouw_formule'
export const DISCOUNT_NOTE_EXTRA_KEY = '_korting_uitleg'

export const WEDDING_TIMING_NOTICE = 'De gekozen trouwformule bepaalt vanaf welk moment DJ Kwinten aanwezig is. Avondfeest: vanaf het hoofdgerecht. Receptie + avondfeest: vanaf de receptie (+ € 100 ten opzichte van Avondfeest). Ceremonie + receptie + avondfeest: vanaf de ceremonie (+ € 350 ten opzichte van Avondfeest). Een zaalintrede is alleen mogelijk vanaf de formule Receptie + avondfeest. Muzikale of technische begeleiding van de ceremonie behoort uitsluitend tot de formule Ceremonie + receptie + avondfeest. Elke wijziging wordt vooraf in onderling overleg bevestigd.'

export const WEDDING_FORMULA_FOOTNOTE = '(*) De professionele installatie is inbegrepen wanneer DJ Kwinten ze voorziet. Verplaatsing is inbegrepen binnen een straal van 20 km rond Deinze; daarbuiten kan een kilometervergoeding gelden.'

export const WEDDING_FORMULAS: WeddingFormula[] = [
  {
    key: 'avondfeest',
    label: 'Avondfeest',
    shortLabel: 'Avondfeest',
    price: 850,
    emoji: '🎉',
    arrivalMoment: 'Aanwezig vanaf het hoofdgerecht',
    includes: [
      'Professionele geluids- en lichtinstallatie (*)',
      'Sfeerverlichting (uplights)',
      'Opbouw en afbraak',
      'DJ zonder vaste eindtijd',
      'Verplaatsing inbegrepen binnen een straal van 20 km rond Deinze (*)',
    ],
  },
  {
    key: 'receptie_avondfeest',
    label: 'Receptie + avondfeest',
    shortLabel: 'Receptie + avondfeest',
    price: 950,
    emoji: '🥂',
    arrivalMoment: 'Aanwezig vanaf de receptie',
    includes: [
      'Alles van het avondfeest',
      'Achtergrondmuziek tijdens de receptie',
      'Muzikale begeleiding van de inkom',
      'Draadloze microfoon voor speeches en aankondigingen',
      'Begeleiding van speeches en andere geplande muziekfragmenten',
    ],
  },
  {
    key: 'ceremonie_receptie_avondfeest',
    label: 'Ceremonie + receptie + avondfeest',
    shortLabel: 'Ceremonie + receptie + avondfeest',
    price: 1200,
    emoji: '💒',
    arrivalMoment: 'Aanwezig vanaf de ceremonie',
    includes: [
      'Inclusief alles uit het pakket “Receptie + avondfeest”',
      'Extra geluidsinstallatie',
      'Draadloze microfoons voor de ceremonie',
      'Muzikale begeleiding van de ceremonie',
      'Volledige technische ondersteuning',
    ],
  },
]

export function getExpandedWeddingFormulaIncludes(formula: WeddingFormula): string[] {
  const ownItems = formula.includes.filter(item =>
    !item.toLowerCase().startsWith('alles van') &&
    !item.toLowerCase().startsWith('inclusief alles uit'),
  )
  const inheritedKey = formula.key === 'receptie_avondfeest'
    ? 'avondfeest'
    : formula.key === 'ceremonie_receptie_avondfeest'
      ? 'receptie_avondfeest'
      : null
  const inheritedFormula = inheritedKey ? WEDDING_FORMULAS.find(item => item.key === inheritedKey) : null
  const items = inheritedFormula ? [...getExpandedWeddingFormulaIncludes(inheritedFormula), ...ownItems] : ownItems

  return [...new Set(items.map(item => item.replace(/\s*\(\*\)\s*$/, '')))]
}

export function formatEuro(amount: number) {
  return `€ ${amount.toFixed(2).replace('.', ',')}`
}

export function parseExtraPrices(raw?: string | null): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v ?? '')]))
  } catch {
    return {}
  }
}

export function stringifyExtraPrices(prices: Record<string, string | number | undefined | null>) {
  const cleaned: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(prices)) {
    if (value === undefined || value === null || value === '') continue
    cleaned[key] = value
  }
  return JSON.stringify(cleaned)
}

export function getWeddingFormula(key?: string | null) {
  return WEDDING_FORMULAS.find(f => f.key === key) || null
}

export function getWeddingFormulaFromExtraPrices(raw?: string | null) {
  const prices = parseExtraPrices(raw)
  return getWeddingFormula(prices[WEDDING_FORMULA_EXTRA_KEY])
}

export function getDefaultWeddingFormula() {
  return WEDDING_FORMULAS[0]
}

const WEDDING_FORMULA_ORDER: WeddingFormulaKey[] = [
  'avondfeest',
  'receptie_avondfeest',
  'ceremonie_receptie_avondfeest',
]

export function selectWeddingFormula(raw: string | null | undefined, key: WeddingFormulaKey) {
  const formula = getWeddingFormula(key)
  if (!formula) throw new Error(`Onbekende trouwformule: ${key}`)
  const prices = parseExtraPrices(raw)
  prices[WEDDING_FORMULA_EXTRA_KEY] = formula.key
  // Ceremoniebegeleiding is voortaan onderdeel van de volledige formule en
  // mag niet daarnaast nog als historische losse toeslag worden aangerekend.
  delete prices.ceremonie_set
  return {
    formula,
    basisprijs: formula.price,
    extra_prijzen: stringifyExtraPrices(prices),
    ceremonie_set: 0 as const,
  }
}

export function selectMinimumWeddingFormula(raw: string | null | undefined, minimum: WeddingFormulaKey) {
  const current = getWeddingFormulaFromExtraPrices(raw)
  const currentIndex = current ? WEDDING_FORMULA_ORDER.indexOf(current.key) : -1
  const minimumIndex = WEDDING_FORMULA_ORDER.indexOf(minimum)
  const selectedKey = currentIndex >= minimumIndex ? current!.key : minimum
  return selectWeddingFormula(raw, selectedKey)
}

export function isWeddingBooking(booking?: Pick<Booking, 'type_feest'> | null) {
  return booking?.type_feest === 'Trouw'
}

export function ensureWeddingFormulaForNewBooking(typeFeest: 'Trouw' | 'Algemeen', currentBasisprijs?: string) {
  if (typeFeest !== 'Trouw') return { basisprijs: currentBasisprijs || '', extra_prijzen: '{}' }
  const formula = getDefaultWeddingFormula()
  return {
    basisprijs: currentBasisprijs || String(formula.price),
    extra_prijzen: stringifyExtraPrices({ [WEDDING_FORMULA_EXTRA_KEY]: formula.key }),
  }
}
