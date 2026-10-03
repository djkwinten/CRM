import { calculateStoredBookingTotal } from '../src/lib/bookingPricing'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

assert(calculateStoredBookingTotal({
  type_feest: 'Verjaardag',
  basisprijs: 850,
  digital_booth: 1,
  extra_prijzen: JSON.stringify({ digital_booth: 200, karaoke: 999, _km_vergoeding: 42.5, _korting: 50 }),
}) === 1042.5, 'De server moet alleen geselecteerde extra’s plus km min korting tellen')

assert(calculateStoredBookingTotal({
  type_feest: 'Trouw',
  basisprijs: 1200,
  ceremonie_set: 1,
  extra_prijzen: JSON.stringify({ _trouw_formule: 'ceremonie_receptie_avondfeest', ceremonie_set: 250 }),
}) === 1200, 'De server mag ceremonie niet naast een trouwformule tellen')

assert(calculateStoredBookingTotal({
  type_feest: 'Trouw',
  basisprijs: 850,
  ceremonie_set: 1,
  extra_prijzen: JSON.stringify({ ceremonie_set: 275 }),
}) === 1125, 'De server moet een historische ceremonietoeslag zonder formule behouden')

assert(calculateStoredBookingTotal({
  type_feest: 'Bedrijfsfeest',
  basisprijs: 700,
  retro_booth: 1,
  extra_prijzen: '{}',
}) === 700, 'Een optie op aanvraag mag zonder CRM-bedrag niet meetellen')

console.log(JSON.stringify({ success: true, authoritativeStoredTotal: true }))
