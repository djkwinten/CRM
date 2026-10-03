export type ServerPricingSource = Record<string, unknown> & {
  type_feest?: unknown
  basisprijs?: unknown
  extra_prijzen?: unknown
  ceremonie_set?: unknown
  digital_booth?: unknown
  retro_booth?: unknown
  draadloze_speaker?: unknown
  karaoke?: unknown
}

const EXTRA_DEFAULTS: Record<string, number | null> = {
  digital_booth: 175,
  retro_booth: null,
  draadloze_speaker: 25,
  karaoke: 150,
}

function amount(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function extraPrices(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

/**
 * Autoritatieve serverberekening. Prijzen komen uitsluitend uit de CRM-velden;
 * een klant kan via een keuzevlag nooit zelf een bedrag insturen.
 */
export function calculateStoredBookingTotal(source: ServerPricingSource): number {
  const prices = extraPrices(source.extra_prijzen)
  const basisprijs = amount(source.basisprijs)
  const korting = amount(prices._korting)
  const kilometervergoeding = amount(prices._km_vergoeding)
  let extras = 0

  for (const [key, fallback] of Object.entries(EXTRA_DEFAULTS)) {
    if (!source[key]) continue
    const stored = prices[key]
    const hasStored = stored !== undefined && stored !== null && String(stored).trim() !== ''
    extras += hasStored ? amount(stored) : (fallback || 0)
  }

  const hasWeddingFormula = String(source.type_feest || '') === 'Trouw' && Boolean(prices._trouw_formule)
  if (!hasWeddingFormula && (source.ceremonie_set || prices.ceremonie_set !== undefined)) {
    const stored = prices.ceremonie_set
    extras += stored !== undefined && stored !== null && String(stored).trim() !== ''
      ? amount(stored)
      : 250
  }

  return Math.max(0, basisprijs + extras + kilometervergoeding - korting)
}
