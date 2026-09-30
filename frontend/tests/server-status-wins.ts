import { mergeBookings } from '../src/lib/localStore'
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

const base = {
  id: 42,
  access_token: 'test-token',
  slug: 'aanvraag-test-2026',
  feest_datum: '2026-12-12',
  type_feest: 'Algemeen',
  status_contract: 0,
  status_voorschot: 0,
  status_vragenlijst: 0,
  naam_organisator: 'Testaanvraag',
  email: '',
  telefoon: '',
  created_at: '2026-09-28T10:00:00.000Z',
  updated_at: '2026-09-28T10:00:00.000Z',
} satisfies Omit<Booking, 'is_aanvraag'>

localStorage.setItem('dj-crm-local-bookings-v1', JSON.stringify([{ ...base, is_aanvraag: 0 }]))
const merged = mergeBookings([{ ...base, is_aanvraag: 1 }])

assert(merged.length === 1, 'Lokaal en serverrecord werden dubbel getoond')
assert(Number(merged[0].is_aanvraag) === 1, 'Verouderde lokale status overschrijft de Gmail-aanvraag')
console.log(JSON.stringify({ success: true, serverRequestStatusWins: true }))
