import { readFileSync } from 'node:fs'
import { canShowFeestNadert, daysUntilEvent } from '../src/lib/feestReminder'
import { getManualKilometervergoeding } from '../src/lib/kilometervergoeding'
import { matchesUpcomingBookingFilter } from '../src/lib/upcomingBookingFilter'
import { aanvraagMoment } from '../src/pages/Dashboard'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const today = new Date(2026, 9, 2, 23, 30)
assert(daysUntilEvent('2026-10-23', today) === 21, 'Exact drie weken moet 21 kalenderdagen zijn')
assert(canShowFeestNadert('2026-10-23', today), 'Feest nadert moet vanaf exact drie weken zichtbaar zijn')
assert(!canShowFeestNadert('2026-10-24', today), 'Feest nadert mag op 22 dagen nog niet zichtbaar zijn')
assert(canShowFeestNadert('2026-10-02', today), 'Feest nadert moet op de feestdatum zichtbaar zijn')
assert(!canShowFeestNadert('2026-10-01', today), 'Feest nadert mag na de feestdatum niet zichtbaar zijn')
assert(!canShowFeestNadert('ongeldig', today), 'Een ongeldige feestdatum mag geen knop tonen')

assert(getManualKilometervergoeding('35.00') === 35, 'Handmatig bedrag wordt niet correct gelezen')
assert(850 + getManualKilometervergoeding('35.00') === 885, 'Handmatig bedrag wordt niet correct in het totaal meegenomen')
assert(getManualKilometervergoeding('') === 0, 'Leeg handmatig bedrag moet nul zijn')
assert(getManualKilometervergoeding(-5) === 0, 'Negatieve kilometervergoeding mag niet meetellen')
assert(getManualKilometervergoeding('niet-numeriek') === 0, 'Ongeldig bedrag mag niet meetellen')

const statuses = [
  { status_contract: 0, status_voorschot: 0 },
  { status_contract: 1, status_voorschot: 0 },
  { status_contract: 0, status_voorschot: 1 },
  { status_contract: 1, status_voorschot: 1 },
]
assert(statuses.filter(item => matchesUpcomingBookingFilter(item, 'alle')).length === 4, 'ALLE moet alle komende boekingen behouden')
assert(statuses.filter(item => matchesUpcomingBookingFilter(item, 'contract')).length === 2, 'CONTRACT moet alleen ontbrekende contracten tonen')
assert(statuses.filter(item => matchesUpcomingBookingFilter(item, 'voorschot')).length === 2, 'VOORSCHOT moet alleen openstaande voorschotten tonen')
assert(matchesUpcomingBookingFilter({ status_contract: 0, status_voorschot: 1 }, 'contract'), 'Bestaande rode contractstatus wordt niet gebruikt')
assert(matchesUpcomingBookingFilter({ status_contract: 1, status_voorschot: 0 }, 'voorschot'), 'Bestaande rode voorschotstatus wordt niet gebruikt')

const aanvraagVolgorde = [
  { id: 1, created_at: '2026-10-01 10:00:00' },
  { id: 2, created_at: '2026-10-03 09:00:00', source_received_at: '2026-10-02T08:00:00.000Z' },
  { id: 3, created_at: '2026-10-04 12:00:00' },
].sort((a, b) => aanvraagMoment(b) - aanvraagMoment(a))
assert(aanvraagVolgorde.map(item => item.id).join(',') === '3,2,1', 'Aanvragen staan niet op aanmaak/importtijd van nieuw naar oud')

const dashboard = readFileSync(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8')
assert((dashboard.match(/canShowFeestNadert\(b\.feest_datum\)/g) || []).length === 2, 'Desktop en mobiel moeten dezelfde 3-wekenregel gebruiken')
assert(dashboard.includes("activeFilter === 'boekingen' && ("), 'De tweede filterbalk is niet uitsluitend aan KOMEND gekoppeld')
assert(dashboard.includes("setUpcomingFilter('alle')"), 'KOMEND stelt de tweede filter niet standaard op ALLE in')
assert(dashboard.includes("matchesUpcomingBookingFilter(b, upcomingFilter)"), 'De komende lijst gebruikt de tweede filter niet')
for (const label of ["label: 'Alle'", "label: 'Contract'", "label: 'Voorschot'"]) {
  assert(dashboard.includes(label), `De tweede filter mist ${label}`)
}

const detail = readFileSync(new URL('../src/pages/BookingDetail.tsx', import.meta.url), 'utf8')
assert(!detail.includes('<Section title="Contact"'), 'De dubbele Contact-kaart staat nog in het boekingsoverzicht')
assert(detail.includes('Contactgegevens'), 'Contactgegevens moet behouden blijven')
assert(detail.includes('Aanvullende boekingsinformatie'), 'Unieke gegevens uit Contact moeten behouden blijven')
assert(detail.includes('updateKmVergoeding'), 'Het handmatige kilometerinvoerveld ontbreekt')
assert(dashboard.includes('.sort((a, b) => aanvraagMoment(b) - aanvraagMoment(a))'), 'De aanvragenlijst sorteert niet op ontvangst-/aanmaaktijd')

const communication = readFileSync(new URL('../src/features/event-workspace/tabs/CommunicationTab.tsx', import.meta.url), 'utf8')
for (const field of ['source_original_message', 'source_sender', 'source_subject', 'source_received_at']) {
  assert(communication.includes(field), `Communicatie mist Gmail-bronveld ${field}`)
}
assert(communication.includes('E-mail ontvangen'), 'Ontvangen Gmail-bericht heeft geen herkenbaar communicatielabel')

const contractForm = readFileSync(new URL('../src/features/event-workspace/components/ContractInfoForm.tsx', import.meta.url), 'utf8')
const contractPdf = readFileSync(new URL('../src/lib/contractPDF.ts', import.meta.url), 'utf8')
const pricing = readFileSync(new URL('../src/lib/bookingPricing.ts', import.meta.url), 'utf8')
const kilometerSources = `${detail}\n${contractForm}\n${contractPdf}\n${pricing}`
for (const legacyKey of ['_km_gratis', '_km_afstand', '_km_ritten', '_km_prijs']) {
  assert(!kilometerSources.includes(legacyKey), `Automatische kilometerfactor staat nog in actieve code: ${legacyKey}`)
}
assert(!contractForm.includes('_km_vergoeding') && !contractForm.includes('Basisprijs'), 'Contract info mag geen financiële prijsbron meer zijn')
assert(detail.includes('calculateBookingPricing'), 'CRM-overzicht gebruikt de centrale prijsberekening niet')
assert(contractPdf.includes('calculateBookingPricing'), 'Contract gebruikt de centrale prijsberekening niet')
assert(pricing.includes("getManualKilometervergoeding(extraPrijzen._km_vergoeding)"), 'De centrale berekening gebruikt het handmatige kilometerbedrag niet')

console.log(JSON.stringify({
  success: true,
  reminderBoundaryDays: 21,
  manualKilometervergoeding: true,
  duplicateContactRemoved: true,
  upcomingStatusFilters: true,
}))
