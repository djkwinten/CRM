import { Hono } from 'hono'
import { query } from '../lib/db'

type Bindings = {
  DB?: D1Database
}

export const calendarRoutes = new Hono<{ Bindings: Bindings }>()

interface BookingRow {
  id: number
  feest_datum: string
  type_feest: string
  naam_organisator: string
  naam_partner1?: string
  naam_partner2?: string
  locatie_naam?: string
  locatie_adres?: string
  uur_dansfeest?: string
  einduur?: string
  is_aanvraag: number
  updated_at?: string
}

function icalDate(dateStr: string): string {
  // "2025-06-14" → "20250614"
  return dateStr.replace(/-/g, '')
}

function icalDateTime(dateStr: string, timeStr?: string): string {
  const datePart = dateStr.replace(/-/g, '')
  if (!timeStr) return datePart
  // "20:00" → "200000"
  const timePart = timeStr.replace(':', '') + '00'
  return `${datePart}T${timePart}`
}

function escapeIcal(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function foldLine(line: string): string {
  // iCal spec: max 75 octets per line, fold with CRLF + space
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line + '\r\n'

  const result: string[] = []
  let pos = 0
  let first = true
  while (pos < line.length) {
    const prefix = first ? '' : ' '
    first = false
    // Take chars until we hit 75 bytes (for first line) or 74 (continuation)
    const limit = result.length === 0 ? 75 : 74
    let chunk = ''
    let byteCount = new TextEncoder().encode(prefix).length
    for (let i = pos; i < line.length; i++) {
      const charBytes = new TextEncoder().encode(line[i]).length
      if (byteCount + charBytes > limit) break
      chunk += line[i]
      byteCount += charBytes
    }
    result.push(prefix + chunk)
    pos += chunk.length
  }
  return result.join('\r\n') + '\r\n'
}

calendarRoutes.get('/bookings.ics', async (c) => {
  const bookings = await query<BookingRow>(c.env, `
    SELECT id, feest_datum, type_feest, naam_organisator, naam_partner1, naam_partner2,
           locatie_naam, locatie_adres, uur_dansfeest, einduur, is_aanvraag, updated_at
    FROM bookings
    ORDER BY feest_datum ASC
  `)

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DJ Kwinten//Boekingen//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:DJ Kwinten Boekingen',
    'X-WR-CALDESC:Boekingen en aanvragen DJ Kwinten',
    'X-WR-TIMEZONE:Europe/Brussels',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]

  for (const b of bookings) {
    if (!b.feest_datum) continue

    // Bepaal naam voor in de agenda
    let titel = ''
    if (b.type_feest === 'Trouw' && (b.naam_partner1 || b.naam_partner2)) {
      const v1 = (b.naam_partner1 || '').split(' ')[0]
      const v2 = (b.naam_partner2 || '').split(' ')[0]
      titel = `💍 Trouw ${[v1, v2].filter(Boolean).join(' & ')}`
    } else if (b.type_feest === 'Trouw') {
      titel = `💍 Trouw ${b.naam_organisator || ''}`
    } else {
      titel = `🎉 ${b.naam_organisator || 'Feest'}`
    }

    if (b.is_aanvraag) {
      titel = `📋 [Aanvraag] ${titel.replace(/^[^\s]+\s/, '')}`
    }

    // Starttijd: als er een uur_dansfeest is, gebruik dat; anders begin van de dag
    const hasStartTime = !!b.uur_dansfeest
    const hasEndTime = !!b.einduur

    const dtstart = hasStartTime
      ? `DTSTART;TZID=Europe/Brussels:${icalDateTime(b.feest_datum, b.uur_dansfeest)}`
      : `DTSTART;VALUE=DATE:${icalDate(b.feest_datum)}`

    // Eindtijd: altijd op dezelfde dag als feest_datum — nooit de volgende dag
    let dtend: string
    if (hasEndTime && hasStartTime) {
      // Altijd einduur op dezelfde dag, ook al is het na middernacht
      dtend = `DTEND;TZID=Europe/Brussels:${icalDateTime(b.feest_datum, b.einduur)}`
    } else if (!hasStartTime) {
      // All-day event: DTEND = zelfde dag (VALUE=DATE = 1 dag event)
      dtend = `DTEND;VALUE=DATE:${icalDate(b.feest_datum)}`
    } else {
      // Start zonder end: zet einduur op 23:59 van dezelfde dag
      dtend = `DTEND;TZID=Europe/Brussels:${icalDateTime(b.feest_datum, '23:59')}`
    }

    // UID: uniek per boeking
    const uid = `booking-${b.id}@djkwinten.be`

    // Beschrijving
    const descParts: string[] = []
    if (b.type_feest) descParts.push(`Type: ${b.type_feest}`)
    if (b.is_aanvraag) descParts.push('Status: Aanvraag (nog te bevestigen)')
    const desc = descParts.join('\\n')

    // Locatie
    const locatie = [b.locatie_naam, b.locatie_adres].filter(Boolean).join(', ')

    // Last modified
    const dtstamp = b.updated_at
      ? b.updated_at.replace(/[-: ]/g, '').replace('T', 'T').slice(0, 15) + 'Z'
      : new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${uid}`)
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(dtstart)
    lines.push(dtend)
    lines.push(`SUMMARY:${escapeIcal(titel)}`)
    if (locatie) lines.push(`LOCATION:${escapeIcal(locatie)}`)
    if (desc) lines.push(`DESCRIPTION:${desc}`)
    // Kleur per type (Apple Agenda ondersteunt dit via X-APPLE-CALENDAR-COLOR op calendar niveau niet per event,
    // maar sommige clients lezen wel X-MICROSOFT-CDO-BUSYSTATUS)
    lines.push(`STATUS:${b.is_aanvraag ? 'TENTATIVE' : 'CONFIRMED'}`)
    lines.push('TRANSP:OPAQUE')
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  // Fold lange regels en voeg CRLF toe
  const icsContent = lines.map(foldLine).join('')

  return new Response(icsContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="djkwinten-boekingen.ics"',
      'Cache-Control': 'no-cache',
    }
  })
})
