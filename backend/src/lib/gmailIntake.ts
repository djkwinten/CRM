type GmailBindings = {
  DB?: D1Database
  GMAIL_CLIENT_ID?: string
  GMAIL_CLIENT_SECRET?: string
  GMAIL_REFRESH_TOKEN?: string
  GMAIL_ACCOUNT?: string
  GMAIL_LABEL_NAME?: string
  GMAIL_EXPECTED_FROM?: string
  GMAIL_EXPECTED_SUBJECT?: string
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const DEFAULT_ACCOUNT = 'djkwinten@gmail.com'
const DEFAULT_LABEL = 'DJ CRM Website-aanvragen'
const DEFAULT_FROM = 'info@djkwinten.be'
const DEFAULT_SUBJECT = 'Bericht via contactformulier website'

export type IntakeStatus = 'nieuw' | 'controle_vereist'

export type ParsedWebsiteRequest = {
  name: string
  email: string
  phone: string
  eventDate: string
  eventType: string
  generalSubtype: string
  locationName: string
  locationAddress: string
  originalMessage: string
  status: IntakeStatus
  issues: string[]
}

type GmailHeader = { name?: string; value?: string }
type GmailPart = {
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
}
type GmailMessage = {
  id: string
  threadId?: string
  internalDate?: string
  payload?: GmailPart
}

type GmailLabel = { id: string; name: string }

export type GmailImportResult = {
  status: 'not_configured' | 'label_missing' | 'initialized' | 'completed' | 'no_database'
  checked: number
  imported: number
  duplicates: number
  ignored: number
  errors: number
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é',
  }
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, entity: string) => {
    const lower = entity.toLowerCase()
    if (lower.startsWith('#x')) {
      const cp = Number.parseInt(lower.slice(2), 16)
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : full
    }
    if (lower.startsWith('#')) {
      const cp = Number.parseInt(lower.slice(1), 10)
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : full
    }
    return named[lower] ?? full
  })
}

export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(html
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
  const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

function collectBodies(part: GmailPart | undefined, wantedMime: string, output: string[]) {
  if (!part) return
  if (part.mimeType?.toLowerCase() === wantedMime && part.body?.data) {
    output.push(decodeBase64Url(part.body.data))
  }
  for (const child of part.parts || []) collectBodies(child, wantedMime, output)
}

function formSignalScore(value: string): number {
  const signals = [
    /Bericht via contactformulier website\s*:/i,
    /(?:^|\n)\s*Naam\s*:/i,
    /(?:^|\n)\s*(?:phone|Telefoon)\s*:/i,
    /(?:^|\n)\s*E-?mailadres\s*:/i,
    /(?:^|\n)\s*Bericht\s*:/i,
  ]
  return signals.reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0)
}

export function gmailMessageText(message: GmailMessage): string {
  const plain: string[] = []
  collectBodies(message.payload, 'text/plain', plain)
  const plainText = plain.join('\n\n').replace(/\r\n?/g, '\n').trim()

  const html: string[] = []
  collectBodies(message.payload, 'text/html', html)
  const htmlText = html.length ? htmlToPlainText(html.join('\n')) : ''

  // Sommige formulierdiensten sturen een minimale text/plain-versie naast een
  // volledige HTML-tabel. Kies dan de variant met de meeste verwachte labels.
  if (htmlText && formSignalScore(htmlText) > formSignalScore(plainText)) return htmlText
  if (plainText) return plainText
  if (htmlText) return htmlText

  const direct = message.payload?.body?.data ? decodeBase64Url(message.payload.body.data) : ''
  return message.payload?.mimeType?.toLowerCase() === 'text/html' ? htmlToPlainText(direct) : direct.trim()
}

function header(message: GmailMessage, name: string): string {
  const match = message.payload?.headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())
  return cleanText(match?.value)
}

function normalizedSubject(value: string): string {
  let result = value.trim()
  while (/^(re|fw|fwd)\s*:/i.test(result)) result = result.replace(/^(re|fw|fwd)\s*:\s*/i, '').trim()
  return result
}

function containsEmailAddress(headerValue: string, email: string): boolean {
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[<\\s,(])${escaped}($|[>\\s,)])`, 'i').test(headerValue)
}

export function isWebsiteContactMessage(
  message: GmailMessage,
  body: string,
  expectedFrom = DEFAULT_FROM,
  expectedSubject = DEFAULT_SUBJECT,
): { accepted: boolean; reason?: string } {
  if (normalizedSubject(header(message, 'Subject')).toLowerCase() !== expectedSubject.toLowerCase()) {
    return { accepted: false, reason: 'onderwerp_komt_niet_overeen' }
  }

  const senderHeaders = ['From', 'Sender', 'Return-Path', 'X-Original-From']
    .map(name => header(message, name))
    .filter(Boolean)
    .join(' ')
  if (!containsEmailAddress(senderHeaders, expectedFrom)) {
    return { accepted: false, reason: 'afzender_komt_niet_overeen' }
  }

  const normalizedBody = body.replace(/\r\n?/g, '\n')
  if (!/Bericht via contactformulier website\s*:/i.test(normalizedBody)) {
    return { accepted: false, reason: 'formulierkenmerk_ontbreekt' }
  }
  if (!/(?:^|\n)\s*Naam\s*:/i.test(normalizedBody)
    || !/(?:^|\n)\s*E-?mailadres\s*:/i.test(normalizedBody)
    || !/(?:^|\n)\s*Bericht\s*:/i.test(normalizedBody)) {
    return { accepted: false, reason: 'formulierlabels_ontbreken' }
  }
  return { accepted: true }
}

function extractField(body: string, label: RegExp, nextLabels: string[]): string {
  const normalized = body.replace(/\r\n?/g, '\n')
  const next = nextLabels.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const end = next ? `(?=\\n\\s*(?:${next})\\s*:|$)` : '$'
  const flags = label.flags.includes('i') ? label.flags : `${label.flags}i`
  const pattern = new RegExp(`(?:^|\\n)[ \\t]*(?:${label.source})[ \\t]*:[ \\t]*([\\s\\S]*?)${end}`, flags)
  const match = normalized.match(pattern)
  return match?.[1]?.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim() || ''
}

const MONTHS: Record<string, number> = {
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6,
  juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
}
const WEEKDAYS: Record<string, number> = {
  zondag: 0, maandag: 1, dinsdag: 2, woensdag: 3, donderdag: 4, vrijdag: 5, zaterdag: 6,
}

function isoDate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day, 12))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

type DateCandidate = { iso: string; weekday?: string; source: string }

function dateCandidates(message: string): DateCandidate[] {
  const candidates: DateCandidate[] = []
  const words = /\b(?:(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\s+)?(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(20\d{2})\b/gi
  for (const match of message.matchAll(words)) {
    const iso = isoDate(Number(match[4]), MONTHS[match[3].toLowerCase()], Number(match[2]))
    if (iso) candidates.push({ iso, weekday: match[1]?.toLowerCase(), source: match[0] })
  }
  const numeric = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})\b/g
  for (const match of message.matchAll(numeric)) {
    const iso = isoDate(Number(match[3]), Number(match[2]), Number(match[1]))
    if (iso) candidates.push({ iso, source: match[0] })
  }
  return candidates
}

function parseEventDate(message: string, receivedAt: string): { value: string; issues: string[] } {
  const candidates = dateCandidates(message)
  if (!candidates.length) return { value: '', issues: ['Geen betrouwbare feestdatum gevonden.'] }
  const unique = [...new Set(candidates.map(candidate => candidate.iso))]
  if (unique.length !== 1) return { value: '', issues: ['Meerdere mogelijke feestdatums gevonden.'] }

  const candidate = candidates.find(item => item.iso === unique[0])!
  if (candidate.weekday) {
    const actual = new Date(`${candidate.iso}T12:00:00Z`).getUTCDay()
    if (WEEKDAYS[candidate.weekday] !== actual) {
      return {
        value: '',
        issues: [`Tegenstrijdige datum: “${candidate.source}” heeft niet de vermelde weekdag.`],
      }
    }
  }

  const receivedDate = receivedAt.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(receivedDate) && candidate.iso < receivedDate) {
    return { value: '', issues: ['De gevonden feestdatum ligt vóór de ontvangstdatum.'] }
  }
  return { value: candidate.iso, issues: [] }
}

function parseEventType(message: string): { type: string; subtype: string } {
  if (/\b(trouw(?:en|feest)?|huwelijk|bruiloft)\b/i.test(message)) return { type: 'Trouw', subtype: '' }
  if (/\b(verjaardag|verjaardagsfeest)\b/i.test(message)) return { type: 'Algemeen', subtype: 'Verjaardagsfeest' }
  if (/\b(bedrijfsfeest|personeelsfeest|company event)\b/i.test(message)) return { type: 'Algemeen', subtype: 'Bedrijfsfeest' }
  if (/\b(jubileum|jubileumfeest)\b/i.test(message)) return { type: 'Algemeen', subtype: 'Jubileumfeest' }
  if (/\b(schoolfeest|schoolbal|galabal)\b/i.test(message)) return { type: 'Algemeen', subtype: 'Schoolfeest' }
  if (/\b(communie|lentefeest)\b/i.test(message)) return { type: 'Algemeen', subtype: 'Communie / lentefeest' }
  return { type: '', subtype: '' }
}

function cleanLocation(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:(?:en|waarbij|waar|omdat|met)\s+(?:we|wij|ik|onze|ons|ze|zij)|en\s+(?:kreeg|kregen|ontving|ontvingen))\b[\s\S]*$/i, '')
    .replace(/[,.\s]+$/, '')
    .trim()
}

function parseLocation(message: string): { name: string; address: string; issues: string[] } {
  const explicitName = message.match(/(?:^|\n)\s*(?:Locatie|Feestzaal|Zaal)\s*:\s*([^\n]+)/i)?.[1]
  if (explicitName) return { name: cleanLocation(explicitName), address: '', issues: [] }

  const phrase = message.match(/\b(?:in|bij)\s+((?:feestzaal|zaal|locatie|kasteel|hoeve|hotel|restaurant)\s+[\s\S]{2,100}?)(?=(?:[,.!?]|\s+(?:(?:en|waarbij|waar|omdat)\s+(?:we|wij|ik|onze|ons|ze|zij)|en\s+(?:kreeg|kregen|ontving|ontvingen))\b|$))/i)?.[1]
  if (phrase) {
    const name = cleanLocation(phrase)
    if (name.length >= 4) return { name, address: '', issues: [] }
  }

  return { name: '', address: '', issues: ['Geen betrouwbare feestlocatie gevonden.'] }
}

export function parseWebsiteRequest(body: string, receivedAt: string): ParsedWebsiteRequest {
  const normalized = body.replace(/\r\n?/g, '\n').trim()
  const message = extractField(normalized, /Bericht/i, [])
  const date = parseEventDate(message, receivedAt)
  const location = parseLocation(message)
  const type = parseEventType(message)
  const name = extractField(normalized, /Naam/i, ['phone', 'Telefoon', 'E-mailadres', 'Emailadres', 'E-mail', 'Bericht'])
  const email = extractField(normalized, /E-?mailadres|E-?mail/i, ['Bericht'])
  const phone = extractField(normalized, /phone|Telefoon/i, ['E-mailadres', 'Emailadres', 'E-mail', 'Bericht'])
  const issues = [...date.issues, ...location.issues]
  if (!type.type) issues.push('Geen betrouwbaar feesttype gevonden.')
  if (!name) issues.push('Naam ontbreekt.')
  if (!email) issues.push('E-mailadres ontbreekt.')

  return {
    name,
    email,
    phone,
    eventDate: date.value,
    eventType: type.type,
    generalSubtype: type.subtype,
    locationName: location.name,
    locationAddress: location.address,
    originalMessage: normalized,
    status: issues.length ? 'controle_vereist' : 'nieuw',
    issues,
  }
}

export async function ensureGmailIntakeTables(env: Pick<GmailBindings, 'DB'>): Promise<void> {
  if (!env.DB) return
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS gmail_intakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER UNIQUE,
      gmail_message_id TEXT NOT NULL UNIQUE,
      gmail_rfc_message_id TEXT,
      source_account TEXT NOT NULL,
      source_sender TEXT,
      source_subject TEXT,
      received_at TEXT NOT NULL,
      original_message TEXT,
      intake_status TEXT NOT NULL DEFAULT 'nieuw',
      issues TEXT,
      decision TEXT NOT NULL DEFAULT 'imported',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `).run()
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_gmail_intakes_booking ON gmail_intakes(booking_id)`).run()
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS gmail_sync_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run()
}

async function stateValue(env: Pick<GmailBindings, 'DB'>, key: string): Promise<string> {
  const row = await env.DB!.prepare('SELECT value FROM gmail_sync_state WHERE key = ?').bind(key).first<{ value: string }>()
  return row?.value || ''
}

async function setStateValue(env: Pick<GmailBindings, 'DB'>, key: string, value: string): Promise<void> {
  await env.DB!.prepare(`
    INSERT INTO gmail_sync_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).bind(key, value).run()
}

async function gmailJson<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Gmail API antwoordde met ${response.status}`)
  return response.json() as Promise<T>
}

async function accessToken(env: GmailBindings): Promise<string> {
  const body = new URLSearchParams({
    client_id: cleanText(env.GMAIL_CLIENT_ID),
    client_secret: cleanText(env.GMAIL_CLIENT_SECRET),
    refresh_token: cleanText(env.GMAIL_REFRESH_TOKEN),
    grant_type: 'refresh_token',
  })
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const data = await response.json() as { access_token?: string; error?: string }
  if (!response.ok || !data.access_token) throw new Error(`Google OAuth-token kon niet worden vernieuwd (${data.error || response.status})`)
  return data.access_token
}

function searchAfterDate(iso: string): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() - 1)
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
}

async function listCandidateIds(access: string, labelId: string | undefined, since: string, subject: string, expectedFrom: string): Promise<string[]> {
  const ids: string[] = []
  let pageToken = ''
  do {
    const cleanSubject = subject.replace(/"/g, '')
    const cleanSender = expectedFrom.replace(/"/g, '')
    const query = `from:"${cleanSender}" subject:"${cleanSubject}" after:${searchAfterDate(since)}`
    const params = new URLSearchParams({ q: query, maxResults: '100' })
    if (labelId) params.set('labelIds', labelId)
    if (pageToken) params.set('pageToken', pageToken)
    const data = await gmailJson<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages?${params}`, access)
    ids.push(...(data.messages || []).map(item => item.id).filter(Boolean))
    pageToken = data.nextPageToken || ''
  } while (pageToken)
  return [...new Set(ids)]
}

function token(bytes = 16): string {
  const data = new Uint8Array(bytes)
  crypto.getRandomValues(data)
  return [...data].map(value => value.toString(16).padStart(2, '0')).join('')
}

function slugify(name: string, date: string, type: string, messageId: string): string {
  const prefix = type === 'Trouw' ? 'trouw' : 'aanvraag'
  const namePart = (name || 'website')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().split(/\s+/).slice(0, 3).join('-') || 'website'
  const year = date?.slice(0, 4) || new Date().getUTCFullYear()
  const suffix = messageId.replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase() || token(4)
  return `${prefix}-${namePart}-${year}-${suffix}`
}

async function recordIgnored(
  env: GmailBindings,
  message: GmailMessage,
  account: string,
  sender: string,
  subject: string,
  receivedAt: string,
  reason: string,
): Promise<'ignored' | 'duplicate'> {
  const result = await env.DB!.prepare(`
    INSERT OR IGNORE INTO gmail_intakes
      (gmail_message_id, gmail_rfc_message_id, source_account, source_sender, source_subject, received_at, intake_status, issues, decision)
    VALUES (?, ?, ?, ?, ?, ?, 'controle_vereist', ?, 'ignored')
  `).bind(message.id, header(message, 'Message-ID') || null, account, sender || null, subject || null, receivedAt, JSON.stringify([reason])).run()
  return result.meta.changes ? 'ignored' : 'duplicate'
}

async function importMessage(
  env: GmailBindings,
  message: GmailMessage,
  parsed: ParsedWebsiteRequest,
  account: string,
  sender: string,
  subject: string,
  receivedAt: string,
): Promise<'imported' | 'duplicate'> {
  const existing = await env.DB!.prepare(
    'SELECT id, decision FROM gmail_intakes WHERE gmail_message_id = ?'
  ).bind(message.id).first<{ id: number; decision: string }>()
  if (existing && existing.decision !== 'ignored') return 'duplicate'

  const access = token()
  const slug = slugify(parsed.name, parsed.eventDate, parsed.eventType, message.id)
  const remarks = parsed.generalSubtype ? `Type algemeen feest: ${parsed.generalSubtype}` : null
  const intakeStatement = existing
    ? env.DB!.prepare(`
        UPDATE gmail_intakes SET
          booking_id = (SELECT id FROM bookings WHERE access_token = ?),
          gmail_rfc_message_id = ?, source_account = ?, source_sender = ?, source_subject = ?,
          received_at = ?, original_message = ?, intake_status = ?, issues = ?,
          decision = 'imported', updated_at = datetime('now')
        WHERE id = ? AND decision = 'ignored'
      `).bind(
        access, header(message, 'Message-ID') || null, account, sender || null, subject,
        receivedAt, parsed.originalMessage, parsed.status, JSON.stringify(parsed.issues), existing.id,
      )
    : env.DB!.prepare(`
        INSERT INTO gmail_intakes (
          booking_id, gmail_message_id, gmail_rfc_message_id, source_account, source_sender,
          source_subject, received_at, original_message, intake_status, issues, decision
        )
        SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported'
        FROM bookings WHERE access_token = ?
      `).bind(
        message.id, header(message, 'Message-ID') || null, account, sender || null, subject,
        receivedAt, parsed.originalMessage, parsed.status, JSON.stringify(parsed.issues), access,
      )
  const batch = await env.DB!.batch([
    env.DB!.prepare(`
      INSERT INTO bookings (
        feest_datum, type_feest, naam_organisator, email, telefoon, access_token, slug,
        is_aanvraag, locatie_naam, locatie_adres, opmerkingen, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, datetime('now'))
    `).bind(
      parsed.eventDate, parsed.eventType, parsed.name || null, parsed.email || null, parsed.phone || null,
      access, slug, parsed.locationName || null, parsed.locationAddress || null, remarks, receivedAt,
    ),
    intakeStatement,
  ])
  if (!batch[0]?.success || !batch[1]?.success || Number(batch[1]?.meta?.changes || 0) !== 1) {
    throw new Error('D1-transactie voor Gmail-aanvraag is niet volledig uitgevoerd')
  }
  return 'imported'
}

export async function runGmailImport(env: GmailBindings): Promise<GmailImportResult> {
  const empty = { checked: 0, imported: 0, duplicates: 0, ignored: 0, errors: 0 }
  if (!env.DB) return { status: 'no_database', ...empty }
  if (!cleanText(env.GMAIL_CLIENT_ID) || !cleanText(env.GMAIL_CLIENT_SECRET) || !cleanText(env.GMAIL_REFRESH_TOKEN)) {
    return { status: 'not_configured', ...empty }
  }

  await ensureGmailIntakeTables(env)
  const access = await accessToken(env)
  const labelName = cleanText(env.GMAIL_LABEL_NAME) || DEFAULT_LABEL
  const labels = await gmailJson<{ labels?: GmailLabel[] }>('/labels', access)
  const label = labels.labels?.find(item => item.name === labelName)

  const activatedAt = await stateValue(env, 'gmail_import_activated_at')
  if (!activatedAt) {
    await setStateValue(env, 'gmail_import_activated_at', new Date().toISOString())
    return { status: 'initialized', ...empty }
  }

  const lastSuccess = await stateValue(env, 'gmail_import_last_success_at') || activatedAt
  const expectedSubject = cleanText(env.GMAIL_EXPECTED_SUBJECT) || DEFAULT_SUBJECT
  const expectedFrom = cleanText(env.GMAIL_EXPECTED_FROM) || DEFAULT_FROM
  const ids = await listCandidateIds(access, label?.id, lastSuccess, expectedSubject, expectedFrom)
  const result: GmailImportResult = { status: 'completed', ...empty, checked: ids.length }
  const account = cleanText(env.GMAIL_ACCOUNT) || DEFAULT_ACCOUNT
  const activationMs = new Date(activatedAt).getTime()

  for (const id of ids) {
    try {
      const message = await gmailJson<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`, access)
      const receivedMs = Number(message.internalDate || 0)
      if (!receivedMs || receivedMs <= activationMs) continue
      const receivedAt = new Date(receivedMs).toISOString()
      const body = gmailMessageText(message)
      const subject = header(message, 'Subject')
      const sender = header(message, 'From')
      const validation = isWebsiteContactMessage(message, body, expectedFrom, expectedSubject)
      if (!validation.accepted) {
        const decision = await recordIgnored(env, message, account, sender, subject, receivedAt, validation.reason || 'niet_herkend')
        result[decision === 'duplicate' ? 'duplicates' : 'ignored']++
        continue
      }

      const parsed = parseWebsiteRequest(body, receivedAt)
      const decision = await importMessage(env, message, parsed, account, sender, subject, receivedAt)
      result[decision === 'duplicate' ? 'duplicates' : 'imported']++
    } catch (error) {
      result.errors++
      console.error('Gmail-aanvraag kon niet worden verwerkt', { gmailMessageId: id, error: error instanceof Error ? error.message : String(error) })
    }
  }

  // Schuif de voortgang alleen op wanneer elk kandidaatbericht beoordeeld is.
  // Bij een tijdelijke Gmail- of D1-fout wordt hetzelfde venster opnieuw gelezen;
  // unieke Gmail-ID's maken reeds verwerkte berichten daarbij onschadelijk.
  if (result.errors === 0) {
    await setStateValue(env, 'gmail_import_last_success_at', new Date().toISOString())
  }
  return result
}
