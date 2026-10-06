import { calculateStoredBookingTotal, upgradeWeddingFormulaForHallEntrance } from '../src/lib/bookingPricing'

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

assert(calculateStoredBookingTotal({
  type_feest: 'Algemeen',
  basisprijs: 700,
  vroeger_aanwezig_receptie: 1,
}) === 775, 'De server moet €75 receptietoeslag bij de basisprijs van €700 tellen')

assert(calculateStoredBookingTotal({
  type_feest: 'Trouw',
  basisprijs: 850,
  vroeger_aanwezig_receptie: 1,
  extra_prijzen: JSON.stringify({ _trouw_formule: 'avondfeest' }),
}) === 850, 'De server mag de algemene receptietoeslag niet op een trouwfeest toepassen')

assert(calculateStoredBookingTotal({
  type_feest: 'Algemeen',
  basisprijs: 700,
  vroeger_aanwezig_receptie: 1,
  digital_booth: 1,
  extra_prijzen: JSON.stringify({ digital_booth: 175, _km_vergoeding: 20, _korting: 50 }),
}) === 920, 'De server moet receptietoeslag, bestaande extra’s, kilometers en korting centraal combineren')

const hallEntranceUpgrade = upgradeWeddingFormulaForHallEntrance({
  type_feest: 'Trouw',
  basisprijs: 850,
  intrede_zaal_nummer: 'Ja',
  digital_booth: 1,
  extra_prijzen: JSON.stringify({ _trouw_formule: 'avondfeest', digital_booth: 175, _km_vergoeding: 20, _korting: 50 }),
})
assert(hallEntranceUpgrade?.basisprijs === 950, 'Een bevestigde zaalintrede moet de formulebasisprijs naar €950 brengen')
assert(hallEntranceUpgrade?.totaalprijs === 1095, 'De formule-upgrade moet bestaande extra’s, kilometers en korting behouden')
assert(JSON.parse(hallEntranceUpgrade?.extra_prijzen || '{}')._trouw_formule === 'receptie_avondfeest', 'De formulecode werd niet opgewaardeerd')

for (const source of [
  { type_feest: 'Trouw', basisprijs: 850, intrede_zaal_nummer: 'Nee', extra_prijzen: JSON.stringify({ _trouw_formule: 'avondfeest' }) },
  { type_feest: 'Trouw', basisprijs: 950, intrede_zaal_nummer: 'Ja', extra_prijzen: JSON.stringify({ _trouw_formule: 'receptie_avondfeest' }) },
  { type_feest: 'Verjaardag', basisprijs: 850, intrede_zaal_nummer: 'Ja', extra_prijzen: JSON.stringify({ _trouw_formule: 'avondfeest' }) },
]) {
  assert(upgradeWeddingFormulaForHallEntrance(source) === null, 'Een niet-toegestane formule-upgrade werd uitgevoerd')
}

console.log(JSON.stringify({ success: true, authoritativeStoredTotal: true, hallEntranceUpgradeGuarded: true }))
