import { Hono } from 'hono'
import { query } from '../lib/db'

type Bindings = {
  DB?: D1Database
}

type CalendarFeed = 'all' | 'bookings' | 'requests'

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
  is_afgewezen: number
  wedding_meeting_at?: string
  wedding_meeting_note?: string
  updated_at?: string
}

function enabledFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'Ja' || value === 'ja'
}

function icalDate(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

function addDays(dateStr: string, days: number): string {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return dateStr
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days))
  return date.toISOString().slice(0, 10)
}

function parseTime(timeStr?: string): { hour: number; minute: number; ical: string } | null {
  const match = String(timeStr || '').match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return { hour, minute, ical: `${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}00` }
}

function icalDateTime(dateStr: string, timeStr: string): string | null {
  const time = parseTime(timeStr)
  return time ? `${icalDate(dateStr)}T${time.ical}` : null
}

function icalDateTimeFromLocal(value: string): string | null {
  const normalized = value.replace(' ', 'T')
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!match) return null
  return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}00`
}

function addMinutesToLocal(value: string, minutes: number): string | null {
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return null
  date.setMinutes(date.getMinutes() + minutes)
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`
}

function icalTimestamp(value?: string): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (match) return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}${match[6]}Z`
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function escapeIcal(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function foldLine(line: string): string {
  const encoder = new TextEncoder()
  const folded: string[] = []
  let current = ''

  for (const character of line) {
    const prefix = folded.length > 0 ? ' ' : ''
    if (encoder.encode(prefix + current + character).length > 75 && current) {
      folded.push(prefix + current)
      current = character
    } else {
      current += character
    }
  }
  folded.push((folded.length > 0 ? ' ' : '') + current)
  return folded.join('\r\n') + '\r\n'
}

function selectColumn(existing: Set<string>, name: string, fallback: string): string {
  return existing.has(name) ? name : `${fallback} AS ${name}`
}

async function readCalendarBookings(env: Bindings): Promise<BookingRow[]> {
  const schema = await query<{ name: string }>(env, 'PRAGMA table_info(bookings)')
  const existing = new Set(schema.map(column => column.name))
  const fields: Array<[keyof BookingRow, string]> = [
    ['id', '0'],
    ['feest_datum', "''"],
    ['type_feest', "'Algemeen'"],
    ['naam_organisator', "''"],
    ['naam_partner1', 'NULL'],
    ['naam_partner2', 'NULL'],
    ['locatie_naam', 'NULL'],
    ['locatie_adres', 'NULL'],
    ['uur_dansfeest', 'NULL'],
    ['einduur', 'NULL'],
    ['is_aanvraag', '0'],
    ['is_afgewezen', '0'],
    ['wedding_meeting_at', 'NULL'],
    ['wedding_meeting_note', 'NULL'],
    ['updated_at', 'NULL'],
  ]
  const select = fields.map(([name, fallback]) => selectColumn(existing, String(name), fallback))
  const orderBy = existing.has('feest_datum') ? 'ORDER BY feest_datum ASC' : 'ORDER BY id ASC'
  return query<BookingRow>(env, `SELECT ${select.join(', ')} FROM bookings ${orderBy}`)
}

function calendarMeta(feed: CalendarFeed) {
  if (feed === 'bookings') {
    return {
      name: 'DJ Kwinten Boekingen',
      description: 'Bevestigde boekingen DJ Kwinten',
      cssColor: 'red',
      appleColor: '#FF3B30',
      filename: 'djkwinten-boekingen-rood.ics',
    }
  }
  if (feed === 'requests') {
    return {
      name: 'DJ Kwinten Aanvragen',
      description: 'Openstaande aanvragen DJ Kwinten',
      cssColor: 'orange',
      appleColor: '#FF9500',
      filename: 'djkwinten-aanvragen-oranje.ics',
    }
  }
  return {
    name: 'DJ Kwinten Agenda',
    description: 'Boekingen en aanvragen DJ Kwinten',
    cssColor: null,
    appleColor: null,
    filename: 'djkwinten-agenda.ics',
  }
}

async function buildCalendarResponse(env: Bindings, feed: CalendarFeed): Promise<Response> {
  const allBookings = await readCalendarBookings(env)
  const bookings = allBookings.filter(booking => {
    if (!booking.feest_datum || enabledFlag(booking.is_afgewezen)) return false
    if (feed === 'bookings') return !enabledFlag(booking.is_aanvraag)
    if (feed === 'requests') return enabledFlag(booking.is_aanvraag)
    return true
  })
  const meta = calendarMeta(feed)
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DJ Kwinten//Agenda//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcal(meta.name)}`,
    `X-WR-CALDESC:${escapeIcal(meta.description)}`,
    'X-WR-TIMEZONE:Europe/Brussels',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  if (meta.cssColor) lines.push(`COLOR:${meta.cssColor}`)
  if (meta.appleColor) lines.push(`X-APPLE-CALENDAR-COLOR:${meta.appleColor}`)

  for (const booking of bookings) {
    const isRequest = enabledFlag(booking.is_aanvraag)
    let title = ''
    if (booking.type_feest === 'Trouw' && (booking.naam_partner1 || booking.naam_partner2)) {
      const first = (booking.naam_partner1 || '').split(' ')[0]
      const second = (booking.naam_partner2 || '').split(' ')[0]
      title = `💍 Trouw ${[first, second].filter(Boolean).join(' & ')}`
    } else if (booking.type_feest === 'Trouw') {
      title = `💍 Trouw ${booking.naam_organisator || ''}`
    } else {
      title = `🎉 ${booking.naam_organisator || 'Feest'}`
    }
    if (isRequest) title = `📋 [Aanvraag] ${title.replace(/^[^\s]+\s/, '')}`

    const startTime = parseTime(booking.uur_dansfeest)
    const endTime = parseTime(booking.einduur)
    let dtstart: string
    let dtend: string
    if (!startTime) {
      dtstart = `DTSTART;VALUE=DATE:${icalDate(booking.feest_datum)}`
      dtend = `DTEND;VALUE=DATE:${icalDate(addDays(booking.feest_datum, 1))}`
    } else {
      dtstart = `DTSTART;TZID=Europe/Brussels:${icalDate(booking.feest_datum)}T${startTime.ical}`
      const fallbackEnd = { hour: 23, minute: 59, ical: '235900' }
      const selectedEnd = endTime || fallbackEnd
      const endsNextDay = selectedEnd.hour * 60 + selectedEnd.minute <= startTime.hour * 60 + startTime.minute
      const endDate = endsNextDay ? addDays(booking.feest_datum, 1) : booking.feest_datum
      dtend = `DTEND;TZID=Europe/Brussels:${icalDate(endDate)}T${selectedEnd.ical}`
    }

    const stamp = icalTimestamp(booking.updated_at)
    const description = [
      booking.type_feest ? `Type: ${booking.type_feest}` : '',
      isRequest ? 'Status: Aanvraag (nog te bevestigen)' : 'Status: Boeking',
    ].filter(Boolean).join('\n')
    const location = [booking.locatie_naam, booking.locatie_adres].filter(Boolean).join(', ')

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:booking-${booking.id}@djkwinten.be`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`LAST-MODIFIED:${stamp}`)
    lines.push(dtstart)
    lines.push(dtend)
    lines.push(`SUMMARY:${escapeIcal(title)}`)
    if (location) lines.push(`LOCATION:${escapeIcal(location)}`)
    lines.push(`DESCRIPTION:${escapeIcal(description)}`)
    lines.push(`CATEGORIES:${isRequest ? 'Aanvraag' : 'Boeking'}`)
    lines.push(`COLOR:${isRequest ? 'orange' : 'red'}`)
    lines.push(`STATUS:${isRequest ? 'TENTATIVE' : 'CONFIRMED'}`)
    lines.push('TRANSP:OPAQUE')
    lines.push('END:VEVENT')

    if (!isRequest && booking.type_feest === 'Trouw' && booking.wedding_meeting_at) {
      const meetingStart = icalDateTimeFromLocal(booking.wedding_meeting_at)
      const meetingEnd = addMinutesToLocal(booking.wedding_meeting_at, 60)
      if (meetingStart && meetingEnd) {
        const meetingDescription = [
          `Voorbespreking voor: ${title}`,
          `Trouwfeest: ${booking.feest_datum}`,
          booking.wedding_meeting_note ? `Notitie: ${booking.wedding_meeting_note}` : '',
        ].filter(Boolean).join('\n')
        lines.push('BEGIN:VEVENT')
        lines.push(`UID:wedding-meeting-${booking.id}@djkwinten.be`)
        lines.push(`DTSTAMP:${stamp}`)
        lines.push(`LAST-MODIFIED:${stamp}`)
        lines.push(`DTSTART;TZID=Europe/Brussels:${meetingStart}`)
        lines.push(`DTEND;TZID=Europe/Brussels:${meetingEnd}`)
        lines.push(`SUMMARY:${escapeIcal(`💍 Afspraak koppel — ${title.replace(/^💍\s*/, '')}`)}`)
        if (booking.locatie_naam) lines.push(`LOCATION:${escapeIcal(booking.locatie_naam)}`)
        lines.push(`DESCRIPTION:${escapeIcal(meetingDescription)}`)
        lines.push('CATEGORIES:Boeking')
        lines.push('COLOR:red')
        lines.push('STATUS:CONFIRMED')
        lines.push('TRANSP:OPAQUE')
        lines.push('END:VEVENT')
      }
    }
  }

  lines.push('END:VCALENDAR')
  const icsContent = lines.map(foldLine).join('')
  return new Response(icsContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${meta.filename}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}

calendarRoutes.get('/bookings.ics', c => buildCalendarResponse(c.env, 'all'))
calendarRoutes.get('/confirmed.ics', c => buildCalendarResponse(c.env, 'bookings'))
calendarRoutes.get('/requests.ics', c => buildCalendarResponse(c.env, 'requests'))
