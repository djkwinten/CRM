import type { Booking } from '../types/booking'
import { getManualKilometervergoeding } from './kilometervergoeding'
import { getWeddingFormula, WEDDING_FORMULA_EXTRA_KEY } from '../config/weddingFormulas'

export type PricingSource = Partial<Booking> & {
  event_type?: string | null
  afgesproken_prijs?: number | null
}

export interface BookingPriceLine {
  key: string
  label: string
  amount: number
  selected: boolean
  onRequest?: boolean
  legacy?: boolean
}

export interface BookingPricing {
  basisprijs: number
  korting: number
  kilometervergoeding: number
  extras: BookingPriceLine[]
  extrasTotaal: number
  totaalprijs: number
  formule: ReturnType<typeof getWeddingFormula>
  extraPrijzen: Record<string, number | string>
}

export const EDITABLE_EXTRA_PRICES = [
  { key: 'digital_booth', label: 'Digitale Photobooth', defaultPrice: 175 },
  { key: 'retro_booth', label: 'Photobooth met Prints', defaultPrice: null },
  { key: 'draadloze_speaker', label: 'Extra Luidspreker voor Receptie', defaultPrice: 25 },
  { key: 'karaoke', label: 'Karaoke', defaultPrice: 150 },
] as const

const LEGACY_CEREMONY_PRICE = 250

function positiveAmount(value: unknown): number {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

export function parseBookingExtraPrices(value: unknown): Record<string, number | string> {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return { ...(value as Record<string, number | string>) }
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, number | string>
      : {}
  } catch {
    return {}
  }
}

/**
 * Enige prijsberekening voor CRM, klantweergave en documenten.
 * Een oude ceremonietoeslag blijft alleen meetellen wanneer nog geen
 * trouwformule is gekozen. Zodra een formule bestaat, zit de ceremonie daarin.
 */
export function calculateBookingPricing(source: PricingSource): BookingPricing {
  const extraPrijzen = parseBookingExtraPrices(source.extra_prijzen)
  const eventType = String(source.type_feest || source.event_type || '')
  const formule = eventType === 'Trouw' ? getWeddingFormula(String(extraPrijzen[WEDDING_FORMULA_EXTRA_KEY] || '')) : null
  const basisprijs = positiveAmount(source.basisprijs)
  const korting = positiveAmount(extraPrijzen._korting)
  const kilometervergoeding = getManualKilometervergoeding(extraPrijzen._km_vergoeding)

  const extras: BookingPriceLine[] = []
  for (const extra of EDITABLE_EXTRA_PRICES) {
    const storedValue = extraPrijzen[extra.key]
    const hasStoredPrice = storedValue !== undefined && storedValue !== null && String(storedValue).trim() !== ''
    const selected = Boolean((source as Record<string, unknown>)[extra.key])
    const amount = hasStoredPrice
      ? positiveAmount(storedValue)
      : selected && extra.defaultPrice !== null
        ? extra.defaultPrice
        : 0

    if (selected) {
      extras.push({ key: extra.key, label: extra.label, amount, selected, onRequest: extra.defaultPrice === null && !hasStoredPrice })
    }
  }

  // Compatibiliteit voor bestaande boekingen: nooit oude omzet stil verwijderen.
  // Dit is geen nieuwe keuze en verdwijnt automatisch uit de berekening zodra
  // een trouwformule is gekozen.
  if (!formule) {
    const storedCeremony = extraPrijzen.ceremonie_set
    const hasStoredCeremony = storedCeremony !== undefined && storedCeremony !== null && String(storedCeremony).trim() !== ''
    const selectedCeremony = Boolean(source.ceremonie_set)
    if (selectedCeremony || hasStoredCeremony) {
      extras.push({
        key: 'ceremonie_set',
        label: 'Bestaande ceremonietoeslag',
        amount: hasStoredCeremony ? positiveAmount(storedCeremony) : LEGACY_CEREMONY_PRICE,
        selected: selectedCeremony,
        legacy: true,
      })
    }
  }

  const extrasTotaal = extras.reduce((sum, extra) => sum + extra.amount, 0)
  const totaalprijs = Math.max(0, basisprijs + extrasTotaal + kilometervergoeding - korting)

  return {
    basisprijs,
    korting,
    kilometervergoeding,
    extras,
    extrasTotaal,
    totaalprijs,
    formule,
    extraPrijzen,
  }
}

export function formatBookingEuro(value: number): string {
  return `€ ${value.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
