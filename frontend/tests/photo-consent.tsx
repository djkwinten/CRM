import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Booking } from '../src/types/booking'
import { PhotoConsentAlert } from '../src/components/PhotoConsentAlert'
import { getPhotoConsentPolicy } from '../src/lib/photoConsent'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const allowed = getPhotoConsentPolicy(1)
const denied = getPhotoConsentPolicy(0)
const unknown = getPhotoConsentPolicy(null)

assert(allowed.state === 'allowed' && allowed.dashboardLabel === 'Beeld toegestaan', 'Toestemming wordt niet correct getoond')
assert(allowed.gigTitle === "FOTO'S & VIDEO'S TOEGESTAAN", 'Gig sheet mist de positieve fotostatus')
assert(denied.state === 'denied' && denied.dashboardLabel === 'Geen beeld', 'Weigering wordt niet correct getoond')
assert(denied.gigTitle === "GEEN FOTO'S OF VIDEO'S" && denied.gigText.includes('niets filmen of fotograferen'), 'Gig sheet mist het duidelijke beeldverbod')
assert(unknown.state === 'unknown' && unknown.gigText.includes('Vraag eerst uitdrukkelijk toestemming'), 'Onbekende keuze is niet veilig')

const dashboardSource = readFileSync(new URL('../src/pages/Dashboard.tsx', import.meta.url), 'utf8')
assert(dashboardSource.includes('<Camera size={12}'), 'Groene camera ontbreekt op dashboard')
assert(dashboardSource.includes('<CameraOff size={12}'), 'Rode doorgestreepte camera ontbreekt op dashboard')
assert((dashboardSource.match(/<PhotoConsentBadge booking=\{b\} \/>/g) || []).length === 3, 'Niet elke boekingslijst toont de beeldstatus')

const fixture: Booking = {
  id: 99,
  feest_datum: '2026-10-10',
  type_feest: 'Algemeen',
  is_aanvraag: 0,
  status_contract: 1,
  status_voorschot: 1,
  status_vragenlijst: 1,
  naam_organisator: 'Testklant',
  email: 'test@example.com',
  telefoon: '0000000000',
}
const deniedHtml = renderToStaticMarkup(<PhotoConsentAlert booking={{ ...fixture, toestemming_foto: 0 }} />)
const allowedHtml = renderToStaticMarkup(<PhotoConsentAlert booking={{ ...fixture, toestemming_foto: 1 }} />)
const unknownHtml = renderToStaticMarkup(<PhotoConsentAlert booking={{ ...fixture, toestemming_foto: undefined }} />)
assert(deniedHtml.includes("GEEN FOTO&#x27;S OF VIDEO&#x27;S"), 'Het beeldverbod wordt niet werkelijk gerenderd')
assert(deniedHtml.includes('border-red-600') && deniedHtml.includes('role="alert"'), 'Het beeldverbod is niet rood en toegankelijk gemarkeerd')
assert(allowedHtml.includes("FOTO&#x27;S &amp; VIDEO&#x27;S TOEGESTAAN") && allowedHtml.includes('border-green-600'), 'Toestemming wordt niet groen gerenderd')
assert(unknownHtml.includes('FOTO- &amp; VIDEOTOESTEMMING NIET INGEVULD') && unknownHtml.includes('border-amber-500'), 'Onbekende toestemming wordt niet veilig gerenderd')

const contractSource = readFileSync(new URL('../src/lib/contractPDF.ts', import.meta.url), 'utf8')
const originalClause = 'Gebruik voor promotionele doeleinden (website, sociale media) gebeurt enkel met voorafgaande toestemming.'
assert(contractSource.includes(originalClause), 'De bestaande contractclausule werd onbedoeld gewijzigd')
assert(!contractSource.includes('getPhotoConsentPolicy'), 'De toestemmingsstatus mag het contract niet wijzigen')

console.log(JSON.stringify({ success: true, dashboardLists: 3, gigSheetAlert: true, contractUnchanged: true }))
