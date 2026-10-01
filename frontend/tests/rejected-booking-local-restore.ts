import { importLocalBookings, localBookings } from '../src/lib/localStore'

type StorageMap = Record<string, string>
const values: StorageMap = {}
const localStorage = {
  getItem: (key: string) => values[key] ?? null,
  setItem: (key: string, value: string) => { values[key] = value },
  removeItem: (key: string) => { delete values[key] },
  clear: () => { for (const key of Object.keys(values)) delete values[key] },
  key: (index: number) => Object.keys(values)[index] ?? null,
  get length() { return Object.keys(values).length },
}

Object.defineProperty(globalThis, 'window', {
  value: { localStorage },
  configurable: true,
})

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const aanvraag = {
  id: 42,
  access_token: 'synthetic-local-rejected-token',
  slug: 'synthetic-local-rejected-request',
  feest_datum: '2031-06-14',
  type_feest: 'Algemeen' as const,
  naam_organisator: 'Synthetische lokale aanvraag',
  is_aanvraag: 1,
  is_afgewezen: 0,
  afgewezen_reden: undefined,
}

importLocalBookings([aanvraag])
importLocalBookings([{ ...aanvraag, is_afgewezen: 1, afgewezen_reden: 'datum' }])

const restored = localBookings()
assert(restored.length === 1, 'Lokale herimport maakte een dubbele aanvraag')
assert(restored[0].is_afgewezen === 1, 'Lokale herimport verloor de afgewezen status')
assert(restored[0].afgewezen_reden === 'datum', 'Lokale herimport verloor de afwijsreden')

console.log(JSON.stringify({
  success: true,
  rows: restored.length,
  rejected: restored[0].is_afgewezen,
  reason: restored[0].afgewezen_reden,
}))
