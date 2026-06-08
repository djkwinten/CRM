export type TemplateKey = 'vragenlijst_reminder' | 'feest_nadert' | 'review_request' | 'aanvraag_followup' | 'afwijzing'

export interface EmailTemplate {
  id: number
  key: TemplateKey | string
  name: string
  subject: string
  body: string
  created_at?: string
  updated_at: string
}

type CloudEnv = {
  STORAGE?: R2Bucket
}

const TEMPLATES_KEY = 'data/email-templates.json'

export const DEFAULT_EMAIL_TEMPLATES: Record<TemplateKey, { name: string; subject: string; body: string }> = {
  vragenlijst_reminder: {
    name: 'Vragenlijst herinnering',
    subject: 'Herinnering: vragenlijst voor jullie feest op {{feest_datum}}',
    body: `Dag {{naam}},

Jullie feest op {{feest_datum}} komt dichterbij.
Ik heb de vragenlijst nog niet ontvangen.

Willen jullie die nog even invullen via:
{{vragenlijst_link}}

Zo kan ik alles goed voorbereiden.

Groetjes,
DJ Kwinten`
  },
  feest_nadert: {
    name: 'Feest nadert',
    subject: 'Jullie feest op {{feest_datum}} komt eraan!',
    body: `Dag {{naam}},

Jullie feest op {{feest_datum}} komt steeds dichterbij — en ik kijk er al enorm naar uit!

Neem gerust nog eens de tijd om jullie vragenlijst te controleren of aan te vullen:
{{vragenlijst_link}}

Heb je ondertussen nog vragen of wil je iets aanpassen? Laat het gerust weten.

Groetjes,
DJ Kwinten`
  },
  review_request: {
    name: 'Review vragen',
    subject: 'Bedankt voor het fijne feest, {{naam}}!',
    body: `Dag {{naam}},

Nog eens bedankt voor het fijne feest op {{feest_datum}}.
Ik hoop dat jullie en jullie gasten een fantastische avond hebben gehad.

Als jullie tevreden waren, zouden jullie dan een korte Google review willen achterlaten?
{{review_link}}

Dat helpt mij enorm.

Groetjes,
DJ Kwinten`
  },
  aanvraag_followup: {
    name: 'Aanvraag follow-up',
    subject: 'Even opvolgen over jouw aanvraag bij DJ Kwinten',
    body: `Dag {{naam}},

Ik wilde even jouw aanvraag voor {{feest_datum}} opvolgen.

Heb je nog vragen, twijfel je nog ergens over of wil je graag bevestigen? Laat gerust iets weten.

Ik help je graag verder.

Groetjes,
DJ Kwinten`
  },
  afwijzing: {
    name: 'Afwijzing / doorgeven',
    subject: 'Jouw aanvraag voor {{feest_datum}}',
    body: `Dag {{naam}},

Bedankt voor je aanvraag voor {{feest_datum}}.

Helaas kan ik deze aanvraag niet verder opnemen.
Reden: {{afgewezen_reden}}

Indien gewenst kan ik je eventueel doorverwijzen naar een collega-DJ.

Groetjes,
DJ Kwinten`
  }
}

function hasStorage(env: CloudEnv | null | undefined): env is { STORAGE: R2Bucket } {
  return !!env?.STORAGE
}

export function defaultTemplates(): EmailTemplate[] {
  const now = new Date().toISOString()
  return Object.entries(DEFAULT_EMAIL_TEMPLATES).map(([key, t], index) => ({
    id: index + 1,
    key,
    name: t.name,
    subject: t.subject,
    body: t.body,
    created_at: now,
    updated_at: now,
  }))
}

export async function readCloudTemplates(env: CloudEnv | null | undefined): Promise<EmailTemplate[]> {
  if (!hasStorage(env)) return defaultTemplates()
  const obj = await env.STORAGE.get(TEMPLATES_KEY)
  if (!obj) {
    const templates = defaultTemplates()
    await writeCloudTemplates(env, templates)
    return templates
  }
  try {
    const body = await obj.json() as { templates?: EmailTemplate[] } | EmailTemplate[]
    const templates = Array.isArray(body) ? body : Array.isArray(body.templates) ? body.templates : []
    if (templates.length > 0) return templates
  } catch { /* fall through to defaults */ }
  const templates = defaultTemplates()
  await writeCloudTemplates(env, templates)
  return templates
}

export async function writeCloudTemplates(env: CloudEnv | null | undefined, templates: EmailTemplate[]): Promise<void> {
  if (!hasStorage(env)) throw new Error('Cloud storage niet geconfigureerd')
  const body = JSON.stringify({ updated_at: new Date().toISOString(), count: templates.length, templates }, null, 2)
  await env.STORAGE.put(TEMPLATES_KEY, body, { httpMetadata: { contentType: 'application/json; charset=utf-8' } })
}

export async function upsertCloudTemplate(env: CloudEnv, key: string, patch: { name?: string; subject: string; body: string }): Promise<EmailTemplate> {
  const templates = await readCloudTemplates(env)
  const now = new Date().toISOString()
  const index = templates.findIndex(t => t.key === key)
  if (index >= 0) {
    templates[index] = {
      ...templates[index],
      name: patch.name || templates[index].name,
      subject: patch.subject,
      body: patch.body,
      updated_at: now,
    }
    await writeCloudTemplates(env, templates)
    return templates[index]
  }
  const template: EmailTemplate = {
    id: Math.max(0, ...templates.map(t => Number(t.id) || 0)) + 1,
    key,
    name: patch.name || key,
    subject: patch.subject,
    body: patch.body,
    created_at: now,
    updated_at: now,
  }
  templates.push(template)
  await writeCloudTemplates(env, templates)
  return template
}

export function extractTemplatesFromBackupBody(body: unknown): unknown[] | null {
  if (!body || typeof body !== 'object') return null
  const obj = body as Record<string, unknown>
  for (const key of ['email_templates', 'templates', 'emailTemplates']) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[]
  }
  for (const key of ['data', 'backup', 'export', 'payload']) {
    const nested = obj[key]
    if (nested && typeof nested === 'object') {
      const nestedObj = nested as Record<string, unknown>
      for (const nestedKey of ['email_templates', 'templates', 'emailTemplates']) {
        if (Array.isArray(nestedObj[nestedKey])) return nestedObj[nestedKey] as unknown[]
      }
    }
  }
  return null
}

export async function importCloudTemplates(env: CloudEnv, rawTemplates: unknown[] | null | undefined): Promise<{ imported: number; skipped: number; total: number; errors: string[] }> {
  if (!rawTemplates?.length) return { imported: 0, skipped: 0, total: 0, errors: [] }
  const existing = await readCloudTemplates(env)
  const now = new Date().toISOString()
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const raw of rawTemplates) {
    if (!raw || typeof raw !== 'object') { skipped++; continue }
    const t = raw as Partial<EmailTemplate>
    if (!t.key || !t.subject || !t.body) { skipped++; continue }
    try {
      const index = existing.findIndex(item => item.key === t.key)
      const next: EmailTemplate = {
        id: Number(t.id) || (index >= 0 ? existing[index].id : Math.max(0, ...existing.map(item => Number(item.id) || 0)) + 1),
        key: String(t.key),
        name: String(t.name || t.key),
        subject: String(t.subject),
        body: String(t.body),
        created_at: t.created_at || now,
        updated_at: now,
      }
      if (index >= 0) existing[index] = { ...existing[index], ...next }
      else existing.push(next)
      imported++
    } catch (e) {
      skipped++
      errors.push(`Template ${String(t.key || '?')}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  await writeCloudTemplates(env, existing)
  return { imported, skipped, total: rawTemplates.length, errors: errors.slice(0, 10) }
}
