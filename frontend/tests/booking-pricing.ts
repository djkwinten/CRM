import { calculateBookingPricing } from '../src/lib/bookingPricing'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const normal = calculateBookingPricing({
  type_feest: 'Verjaardag',
  basisprijs: 850,
  digital_booth: 1,
  draadloze_speaker: 1,
  extra_prijzen: JSON.stringify({
    digital_booth: 200,
    draadloze_speaker: 25,
    karaoke: 999,
    _km_vergoeding: 42.5,
    _korting: 50,
  }),
  totaalprijs: 12345,
})
assert(normal.extrasTotaal === 225, 'Alleen geselecteerde extra’s mogen meetellen')
assert(normal.kilometervergoeding === 42.5, 'Kilometervergoeding moet centraal meetellen')
assert(normal.totaalprijs === 1067.5, 'Totaal moet basis + geselecteerde extra’s + km - korting zijn')

const wedding = calculateBookingPricing({
  type_feest: 'Trouw',
  basisprijs: 1200,
  ceremonie_set: 1,
  extra_prijzen: JSON.stringify({
    _trouw_formule: 'ceremonie_receptie_avondfeest',
    ceremonie_set: 250,
  }),
})
assert(wedding.formule?.key === 'ceremonie_receptie_avondfeest', 'De trouwformule moet herkend worden')
assert(!wedding.extras.some(extra => extra.key === 'ceremonie_set'), 'Ceremonie mag naast een trouwformule niet dubbel tellen')
assert(wedding.totaalprijs === 1200, 'De volledige trouwformule mag geen losse ceremonietoeslag krijgen')

const legacyCeremony = calculateBookingPricing({
  type_feest: 'Trouw',
  basisprijs: 850,
  ceremonie_set: 1,
  extra_prijzen: JSON.stringify({ ceremonie_set: 275 }),
})
assert(legacyCeremony.extras.some(extra => extra.key === 'ceremonie_set' && extra.amount === 275 && extra.legacy), 'Een bestaande ceremonietoeslag zonder formule moet behouden blijven')
assert(legacyCeremony.totaalprijs === 1125, 'Historische omzet mag niet stil verdwijnen')

const earlyReception = calculateBookingPricing({
  type_feest: 'Algemeen',
  basisprijs: 700,
  vroeger_aanwezig_receptie: 1,
  vroeger_aanwezig_receptie_na_contract: 1,
  digital_booth: 1,
  extra_prijzen: JSON.stringify({ digital_booth: 175, _korting: 50 }),
})
const earlyReceptionLine = earlyReception.extras.find(extra => extra.key === 'vroeger_aanwezig_receptie')
assert(earlyReception.basisprijs === 700, 'De receptietoeslag mag de basisprijs niet wijzigen')
assert(earlyReceptionLine?.amount === 75, 'De receptietoeslag moet een afzonderlijke regel van €75 zijn')
assert(earlyReceptionLine?.addedAfterContract === true, 'Een na-contracttoeslag moet zichtbaar gemarkeerd blijven')
assert(earlyReception.totaalprijs === 900, 'Het actuele totaal moet basis + receptietoeslag + extra - korting zijn')

const weddingWithoutSurcharge = calculateBookingPricing({
  type_feest: 'Trouw',
  basisprijs: 850,
  vroeger_aanwezig_receptie: 1,
  extra_prijzen: JSON.stringify({ _trouw_formule: 'avondfeest' }),
})
assert(!weddingWithoutSurcharge.extras.some(extra => extra.key === 'vroeger_aanwezig_receptie'), 'De receptietoeslag mag niet op trouwfeesten worden toegepast')
assert(weddingWithoutSurcharge.totaalprijs === 850, 'Een trouwfeest kreeg ten onrechte de algemene receptietoeslag')

const requestPrice = calculateBookingPricing({
  type_feest: 'Bedrijfsfeest',
  basisprijs: 700,
  retro_booth: 1,
  extra_prijzen: '{}',
})
assert(requestPrice.extras[0]?.onRequest === true, 'Een geselecteerde optie zonder prijs moet op aanvraag blijven')
assert(requestPrice.totaalprijs === 700, 'Een optie op aanvraag mag zonder afgesproken bedrag niet meetellen')

console.log('booking pricing: ok')
