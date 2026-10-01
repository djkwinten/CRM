import type { Booking } from '../src/types/booking'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
    clear: () => memory.clear(),
  },
  configurable: true,
})

const { submitQuestionnaire } = await import('../src/lib/api')
const { localBookings } = await import('../src/lib/localStore')

const localBooking: Booking = {
  id: 77,
  access_token: 'synthetic-submit-token',
  slug: 'synthetic-submit',
  feest_datum: '2033-05-14',
  type_feest: 'Trouw',
  is_aanvraag: 0,
  status_contract: 0,
  status_voorschot: 0,
  status_vragenlijst: 0,
  naam_organisator: 'Synthetische klant',
  email: 'synthetic@example.invalid',
  telefoon: '0000000000',
}
localStorage.setItem('dj-crm-local-bookings-v1', JSON.stringify([localBooking]))

Object.defineProperty(globalThis, 'fetch', {
  value: async () => { throw new Error('synthetische netwerkuitval') },
  configurable: true,
  writable: true,
})
const failed = await submitQuestionnaire('synthetic-submit-token', { werk_partner1: 'synthetisch beroep' })
assert(failed.success === false, 'Netwerkuitval werd ten onrechte als succesvolle opslag gemeld')
assert(Number(localBookings()[0].status_vragenlijst) === 0, 'Lokale status werd vóór serverbevestiging voltooid')
assert(!localBookings()[0].werk_partner1, 'Niet-bevestigde invoer werd als definitieve boekingsdata gemarkeerd')

Object.defineProperty(globalThis, 'fetch', {
  value: async () => new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }),
  configurable: true,
  writable: true,
})
const saved = await submitQuestionnaire('synthetic-submit-token', { werk_partner1: 'synthetisch beroep' })
assert(saved.success === true, 'Echte serverbevestiging werd niet aanvaard')
assert(Number(localBookings()[0].status_vragenlijst) === 1, 'Bevestigde inzending kreeg geen ingediend-status')
assert(localBookings()[0].werk_partner1 === 'synthetisch beroep', 'Bevestigde invoer werd niet lokaal gesynchroniseerd')

console.log(JSON.stringify({
  success: true,
  networkFailureRejected: true,
  serverConfirmationRequired: true,
}))
