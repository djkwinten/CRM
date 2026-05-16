import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  Wifi, CheckCircle2, ChevronRight, ChevronLeft, Heart, Download, FileText,
} from 'lucide-react'
import { getBooking, submitQuestionnaire, getBookingPDF, getContractInfo } from '../lib/api'
import { Booking } from '../types/booking'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'

// ─── Reusable form components ─────────────────────────────────────────────────

function FormField({ label, sublabel, children }: { label: string; sublabel?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {sublabel && <p className="text-xs text-gray-400 mb-2">{sublabel}</p>}
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', required }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean
}) {
  return (
    <input type={type} required={required} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-4 py-3 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all" />
  )
}

function Textarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-4 py-3 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all resize-none" />
  )
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-4 py-3 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all">
      {children}
    </select>
  )
}

function generateTimeOptions() {
  const opts: string[] = []
  // Start at 10:00, wrap around midnight, end at 09:45
  for (let i = 0; i < 96; i++) {
    const totalMinutes = (10 * 60 + i * 15) % (24 * 60)
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    opts.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return opts
}
const TIME_OPTIONS = generateTimeOptions()


// ─── Extras with images ────────────────────────────────────────────────────────

const EXTRAS = [
  {
    key: 'ceremonie_set',
    label: 'Ceremonie Set',
    desc: 'Muziek voor de huwelijksceremonie',
    emoji: '🎵',
    prijs: 250,
    color: 'from-pink-500/20 to-rose-500/20 border-pink-500/30',
    active: 'border-pink-500 bg-pink-500/20',
    link: 'https://djkwinten.be/formules/ceremonie'
  },
  {
    key: 'digital_booth',
    label: 'Digitale Photobooth',
    desc: 'Moderne digitale photobooth met filters',
    emoji: '📸',
    prijs: 175,
    color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30',
    active: 'border-blue-500 bg-blue-500/20',
    link: 'https://djkwinten.be/formules/photobooth'
  },
  {
    key: 'retro_booth',
    label: 'Photobooth met Prints',
    desc: 'Klassieke fotohoek met vintage uitstraling',
    emoji: '🎞️',
    prijs: null,
    opAanvraag: true,
    aanvraagLink: 'https://www.photobilly.be',
    color: 'from-amber-500/20 to-orange-500/20 border-amber-500/30',
    active: 'border-amber-500 bg-amber-500/20',
  },
  {
    key: 'draadloze_speaker',
    label: 'Extra Luidspreker voor Receptie',
    desc: 'Ideaal als receptie buiten of op een andere locatie doorgaat',
    emoji: '🔊',
    prijs: 25,
    color: 'from-green-500/20 to-emerald-500/20 border-green-500/30',
    active: 'border-green-500 bg-green-500/20'
  },
  {
    key: 'karaoke',
    label: 'Karaoke',
    desc: 'Karaoke setup voor de gezelligste avond',
    emoji: '🎤',
    prijs: 150,
    color: 'from-purple-500/20 to-violet-500/20 border-purple-500/30',
    active: 'border-purple-500 bg-purple-500/20',
    link: 'https://djkwinten.be/formules/karaoke'
  },
]

const DJ_VOORZIENINGEN = [
  { key: 'speakers_aanwezig', label: 'Muziekinstallatie', emoji: '🔉', color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30', active: 'border-blue-500 bg-blue-500/20' },
  { key: 'licht_aanwezig', label: 'Lichtshow', emoji: '💡', color: 'from-yellow-500/20 to-amber-500/20 border-yellow-500/30', active: 'border-yellow-500 bg-yellow-500/20' },
  { key: 'micro_aanwezig', label: 'Microfoon', emoji: '🎙️', color: 'from-gray-400/20 to-slate-500/20 border-gray-400/30', active: 'border-gray-500 bg-gray-400/20' },
  { key: 'dj_booth_aanwezig', label: 'DJ-BOOTH / DJ-TAFEL', emoji: '🎛️', color: 'from-indigo-500/20 to-purple-500/20 border-indigo-500/30', active: 'border-indigo-500 bg-indigo-500/20' },
  { key: 'uplights_aanwezig', label: 'Uplights', emoji: '✨', color: 'from-pink-500/20 to-rose-500/20 border-pink-500/30', active: 'border-pink-500 bg-pink-500/20' },
]

// ─── Step components ───────────────────────────────────────────────────────────

const FEEST_TYPES = ['Verjaardag', 'Jubileum', 'Pensioen', 'Bedrijfsfeest', 'Familiefeest', 'Anders']

type FormState = Partial<Booking> & { subtype?: string }

function StepContact({ form, setForm, isTrouw }: { form: FormState; setForm: (u: Partial<FormState>) => void; isTrouw: boolean }) {
  return (
    <div className="space-y-5">
      {isTrouw && (
        <div className="bg-pink-50 border border-pink-200 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-pink-700">💍 Namen van het Koppel</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Partner 1">
              <Input value={form.naam_partner1 || ''} onChange={v => setForm({ naam_partner1: v })} placeholder="Voornaam Achternaam" />
            </FormField>
            <FormField label="Partner 2">
              <Input value={form.naam_partner2 || ''} onChange={v => setForm({ naam_partner2: v })} placeholder="Voornaam Achternaam" />
            </FormField>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {!isTrouw && (
          <FormField label="Naam Organisator *">
            <Input value={form.naam_organisator || ''} onChange={v => setForm({ naam_organisator: v })} placeholder="Voornaam Achternaam" required />
          </FormField>
        )}
        {!isTrouw && (
          <FormField label="Bedrijfsnaam">
            <Input value={form.bedrijfsnaam || ''} onChange={v => setForm({ bedrijfsnaam: v })} placeholder="Optioneel" />
          </FormField>
        )}
        {!isTrouw && form.bedrijfsnaam && (
          <FormField label="BTW-nummer" sublabel="Verplicht voor bedrijfsfactuur">
            <Input value={form.btw_nr || ''} onChange={v => setForm({ btw_nr: v })} placeholder="BE 0xxx.xxx.xxx" />
          </FormField>
        )}
        <FormField label="E-mailadres *">
          <Input type="email" value={form.email || ''} onChange={v => setForm({ email: v })} placeholder="jouw@email.be" required />
        </FormField>
        <FormField label="Telefoonnummer *">
          <Input type="tel" value={form.telefoon || ''} onChange={v => setForm({ telefoon: v })} placeholder="+32 xxx xx xx xx" required />
        </FormField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FormField label="Aantal Gasten (schatting)">
          <Input type="number" value={form.aantal_gasten?.toString() || ''} onChange={v => setForm({ aantal_gasten: parseInt(v) || undefined })} placeholder="150" />
        </FormField>
        <FormField label="Publiek & Leeftijd" sublabel="Op wie focust de DJ tijdens het feest?">
          <Select value={form.publiek_leeftijd || ''} onChange={v => setForm({ publiek_leeftijd: v })}>
            <option value="">— Kies een optie —</option>
            <option value="mix">Gemengd — alle leeftijden gelijk</option>
            <option value="jong">Voornamelijk jong publiek (20–35j)</option>
            <option value="middel">Voornamelijk 35–55 jaar</option>
            <option value="ouder">Voornamelijk 55+ jaar</option>
            <option value="jong_focus">Alle leeftijden, maar focus op jongeren</option>
            <option value="ouder_focus">Alle leeftijden, maar focus op 50+</option>
          </Select>
        </FormField>
      </div>
      <FormField label="Thema of Dress Code" sublabel="Optioneel — geef gerust een sfeervolle beschrijving">
        <Input value={form.thema || ''} onChange={v => setForm({ thema: v })} placeholder="Bijv. Tropical, Bohemian, Zwart-Wit, ..." />
      </FormField>
      {!isTrouw && (
        <FormField label="Type Feest">
          <Select value={form.subtype || 'Verjaardag'} onChange={v => setForm({ subtype: v })}>
            {FEEST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        </FormField>
      )}

      <FormField label="Adres Organisator" sublabel="Straat, nummer, postcode en gemeente — nodig voor het contract">
        <Input value={form.adres_organisator || ''} onChange={v => setForm({ adres_organisator: v })} placeholder="Kerkstraat 12, 9000 Gent" />
      </FormField>

      <UitnodigingUpload form={form} setForm={setForm} />

      {/* Back-up contact */}
      <div className="pt-2">
        <p className="text-sm font-medium text-gray-700 mb-1">📞 Back-up Contact op de Avond</p>
        <p className="text-xs text-gray-500 mb-3">Wie is de ceremoniemeester of contactpersoon tijdens het feest, indien dit niet de organisator is?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Naam">
            <Input value={form.backup_contact_naam || ''} onChange={v => setForm({ backup_contact_naam: v })} placeholder="Voornaam Achternaam" />
          </FormField>
          <FormField label="Telefoonnummer">
            <Input type="tel" value={form.backup_contact_telefoon || ''} onChange={v => setForm({ backup_contact_telefoon: v })} placeholder="+32 xxx xx xx xx" />
          </FormField>
        </div>
      </div>
    </div>
  )
}

const NA = 'n.v.t.'

interface ExtraMoment { label: string; uur: string; preset?: boolean; wie?: string; index?: number }

// Tijdkeuze-opties per speciaal moment (trouw)
// uur-veld: keuze-optie string, of "anders|vrije tekst"
const GROEPSFOTO_OPTIES = ['Voor de openingsdans', 'Na de openingsdans']
const SPEECH_KOPPEL_OPTIES = ['Bij de receptie', 'Na de intrede in de zaal', 'Na het inschenken van de wijn', 'Anders']
const EXTRA_SPEECH_OPTIES = ['Na de speech van het koppel', 'Voor het voorgerecht', 'Voor het diner', 'Voor het dessert', 'Voor de openingsdans', 'Anders']
const VERRASSING_OPTIES = ['Na de speech van het koppel', 'Voor het voorgerecht', 'Voor het diner', 'Voor het dessert', 'Voor de openingsdans', 'Anders']

const PLANNING_PRESETS_TROUW = [
  { key: 'boeketwerpen', emoji: '💐', label: 'Boeketwerpen' },
  { key: 'groepsfoto', emoji: '📸', label: 'Groepsfoto' },
  { key: 'optreden_bandje', emoji: '🎸', label: 'Optreden bandje' },
  { key: 'speech_koppel', emoji: '🎤', label: 'Speech koppel' },
  // Extra Speech is apart behandeld (meerdere mogelijk)
  { key: 'verrassing', emoji: '🎁', label: 'Verrassing' },
]

const PLANNING_PRESETS_ALGEMEEN = [
  { key: 'groepsfoto', emoji: '📸', label: 'Groepsfoto' },
  { key: 'optreden_bandje', emoji: '🎸', label: 'Optreden bandje' },
  { key: 'speech', emoji: '🎤', label: 'Speech' },
  { key: 'verrassing', emoji: '🎁', label: 'Verrassing' },
]

// Helper: parse keuze + vrij tekst uit uur-veld
function parseKeuze(uur: string): { keuze: string; vrij: string } {
  if (uur.startsWith('Anders|')) return { keuze: 'Anders', vrij: uur.slice(7) }
  return { keuze: uur, vrij: '' }
}
function buildKeuze(keuze: string, vrij: string): string {
  return keuze === 'Anders' ? `Anders|${vrij}` : keuze
}

function KeuzeSelect({ opties, value, onChange }: {
  opties: string[]; value: string; onChange: (v: string) => void
}) {
  const { keuze, vrij } = parseKeuze(value)
  return (
    <div className="space-y-2 mt-2">
      <div className="flex flex-wrap gap-1.5">
        {opties.map(opt => (
          <button key={opt} type="button"
            onClick={() => onChange(buildKeuze(opt, opt === 'Anders' ? vrij : ''))}
            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
              keuze === opt
                ? 'border-[#007AFF] bg-[#007AFF] text-white'
                : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
            }`}>
            {opt}
          </button>
        ))}
      </div>
      {keuze === 'Anders' && (
        <input type="text" value={vrij}
          onChange={e => onChange(buildKeuze('Anders', e.target.value))}
          placeholder="Beschrijf het moment..."
          className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all" />
      )}
    </div>
  )
}

function PlanningRow({ emoji, label, value, onChange }: {
  emoji: string; label: string; value: string; onChange: (v: string) => void
}) {
  const isNA = value === NA
  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      <span className="text-lg w-7 text-center flex-shrink-0">{emoji}</span>
      <span className="text-sm font-medium text-gray-700 flex-1">{label}</span>
      <div className="flex items-center gap-2">
        {!isNA && (
          <select value={value} onChange={e => onChange(e.target.value)}
            className="bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 text-sm font-mono transition-all w-28">
            <option value="">— uur —</option>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <button type="button" onClick={() => onChange(isNA ? '' : NA)}
          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all flex-shrink-0 ${
            isNA ? 'bg-gray-200 text-gray-500 border-gray-300' : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300'
          }`}>
          {isNA ? 'n.v.t.' : 'n.v.t.'}
        </button>
      </div>
    </div>
  )
}

function StepPlanning({ form, setForm, isTrouw }: { form: FormState; setForm: (u: Partial<FormState>) => void; isTrouw: boolean }) {
  const [tweedeReceptie, setTweedeReceptie] = useState(!!(form.uur_receptie2 || form.uur_receptie2_einde))
  const [allMomenten, setAllMomenten] = useState<ExtraMoment[]>(() => {
    try { return JSON.parse((form as Record<string,string>).planning_extra || '[]') } catch { return [] }
  })

  const saveAll = (updated: ExtraMoment[]) => {
    setAllMomenten(updated)
    setForm({ planning_extra: JSON.stringify(updated) } as Partial<FormState>)
  }

  // Presets: toggle aan/uit, uur aanpassen
  const togglePreset = (_key: string, _emoji: string, label: string) => {
    const exists = allMomenten.find(m => m.preset && m.label === label)
    if (exists) {
      saveAll(allMomenten.filter(m => !(m.preset && m.label === label)))
    } else {
      saveAll([...allMomenten, { label, uur: '', preset: true }])
    }
  }
  const updatePresetUur = (label: string, uur: string) => {
    saveAll(allMomenten.map(m => m.preset && m.label === label ? { ...m, uur } : m))
  }

  // Vrije extra momenten (niet-preset)
  const vrijeMomenten = allMomenten.filter(m => !m.preset)
  const updateExtra = (idx: number, key: keyof ExtraMoment, val: string) => {
    const vrijIdx = allMomenten.indexOf(vrijeMomenten[idx])
    const updated = allMomenten.map((m, i) => i === vrijIdx ? { ...m, [key]: val } : m)
    saveAll(updated)
  }
  const addExtra = () => saveAll([...allMomenten, { label: '', uur: '' }])
  const removeExtra = (idx: number) => {
    const vrijIdx = allMomenten.indexOf(vrijeMomenten[idx])
    saveAll(allMomenten.filter((_, i) => i !== vrijIdx))
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4 border border-gray-200">
        Vul de tijdstippen in die van toepassing zijn. Klik op <strong>n.v.t.</strong> als een moment niet van toepassing is.
      </p>

      <div className="bg-white border border-gray-200 rounded-2xl px-4 divide-y divide-gray-100">
        {/* Ceremonie — enkel trouw */}
        {isTrouw && (
          <PlanningRow emoji="💒" label="Ceremonie" value={form.uur_ceremonie || ''} onChange={v => setForm({ uur_ceremonie: v })} />
        )}

        {/* Receptie */}
        <div className="py-3 border-b border-gray-100 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-lg w-7 text-center flex-shrink-0">🥂</span>
            <span className="text-sm font-medium text-gray-700 flex-1">Receptie</span>
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400">Start</label>
                <select value={form.uur_receptie || ''} onChange={e => setForm({ uur_receptie: e.target.value })}
                  className="bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 focus:outline-none focus:border-[#007AFF] text-sm font-mono transition-all w-28">
                  <option value="">— uur —</option>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400">Einde</label>
                <select value={form.uur_receptie_einde || ''} onChange={e => setForm({ uur_receptie_einde: e.target.value })}
                  className="bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 focus:outline-none focus:border-[#007AFF] text-sm font-mono transition-all w-28">
                  <option value="">— uur —</option>
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* 2e receptie — enkel trouw */}
          {isTrouw && (
            <>
              <button type="button"
                onClick={() => { setTweedeReceptie(!tweedeReceptie); if (tweedeReceptie) setForm({ uur_receptie2: '', uur_receptie2_einde: '' }) }}
                className={`ml-10 flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                  tweedeReceptie ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-300'
                }`}>
                {tweedeReceptie ? '✓' : '+'} Tweede receptie
              </button>
              {tweedeReceptie && (
                <div className="ml-10 flex items-center gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-gray-400">Start 2e</label>
                    <select value={form.uur_receptie2 || ''} onChange={e => setForm({ uur_receptie2: e.target.value })}
                      className="bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm font-mono transition-all w-28">
                      <option value="">— uur —</option>
                      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-gray-400">Einde 2e</label>
                    <select value={form.uur_receptie2_einde || ''} onChange={e => setForm({ uur_receptie2_einde: e.target.value })}
                      className="bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm font-mono transition-all w-28">
                      <option value="">— uur —</option>
                      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <PlanningRow emoji="🍽️" label="Diner" value={form.uur_diner || ''} onChange={v => setForm({ uur_diner: v })} />
        <PlanningRow emoji="🎂" label="Dessert" value={form.uur_dessert || ''} onChange={v => setForm({ uur_dessert: v })} />
        <PlanningRow emoji="🕺" label="Dansfeest" value={form.uur_dansfeest || ''} onChange={v => setForm({ uur_dansfeest: v })} />
        <PlanningRow emoji="🌙" label="Midnight Snack" value={form.uur_midnightsnack || ''} onChange={v => setForm({ uur_midnightsnack: v })} />
        <PlanningRow emoji="🔚" label="Einduur" value={form.einduur || ''} onChange={v => setForm({ einduur: v })} />

        {/* Vrije extra momenten */}
        {vrijeMomenten.map((m, i) => (
          <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
            <span className="text-lg w-7 text-center flex-shrink-0">✨</span>
            <input
              type="text"
              value={m.label}
              onChange={e => updateExtra(i, 'label', e.target.value)}
              placeholder="Omschrijving..."
              className="flex-1 bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all"
            />
            <select value={m.uur} onChange={e => updateExtra(i, 'uur', e.target.value)}
              className="bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm font-mono transition-all w-28">
              <option value="">— uur —</option>
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button type="button" onClick={() => removeExtra(i)}
              className="text-red-400 hover:text-red-600 text-xs px-2 py-1.5 rounded-lg transition-colors flex-shrink-0">✕</button>
          </div>
        ))}
      </div>

      {/* Vaste momenten — checkboxes met slimme tijdkeuze */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">📋 Andere momenten</p>
        <p className="text-xs text-gray-400 mb-3">Vink aan wat van toepassing is</p>
        <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
          {(isTrouw ? PLANNING_PRESETS_TROUW : PLANNING_PRESETS_ALGEMEEN).map(({ key, emoji, label }) => {
            const moment = allMomenten.find(m => m.preset && m.label === label)
            const active = !!moment
            const heeftKeuzeOpties = isTrouw && ['Groepsfoto', 'Speech koppel', 'Verrassing'].includes(label)
            const keuzeOpties = label === 'Groepsfoto' ? GROEPSFOTO_OPTIES
              : label === 'Speech koppel' ? SPEECH_KOPPEL_OPTIES
              : label === 'Verrassing' ? VERRASSING_OPTIES : null
            return (
              <div key={key} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <button type="button"
                    onClick={() => togglePreset(key, emoji, label)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      active ? 'border-[#007AFF] bg-[#007AFF]' : 'border-gray-300 bg-white'
                    }`}>
                    {active && <CheckCircle2 size={12} className="text-white" />}
                  </button>
                  <span className="text-base flex-shrink-0">{emoji}</span>
                  <span className={`text-sm flex-1 ${active ? 'font-medium text-gray-800' : 'text-gray-500'}`}>{label}</span>
                  {active && !heeftKeuzeOpties && (
                    <select value={moment.uur} onChange={e => updatePresetUur(label, e.target.value)}
                      className="bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-1.5 text-sm font-mono transition-all w-28">
                      <option value="">— uur —</option>
                      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                </div>
                {active && heeftKeuzeOpties && keuzeOpties && (
                  <div className="ml-8">
                    <KeuzeSelect opties={keuzeOpties} value={moment.uur}
                      onChange={v => updatePresetUur(label, v)} />
                  </div>
                )}
              </div>
            )
          })}

          {/* Extra Speech — enkel trouw, meerdere mogelijk */}
          {isTrouw && (() => {
            const extraSpeeches = allMomenten.filter(m => m.preset && m.label === 'Extra Speech')
            return (
              <div className="px-4 py-3 space-y-3">
                <div className="flex items-center gap-3">
                  <button type="button"
                    onClick={() => saveAll([...allMomenten, { label: 'Extra Speech', uur: '', preset: true, wie: '' }])}
                    className="w-5 h-5 rounded border-2 border-dashed border-gray-300 flex items-center justify-center flex-shrink-0 hover:border-[#007AFF] transition-all text-gray-400 hover:text-[#007AFF] text-xs font-bold">
                    +
                  </button>
                  <span className="text-base flex-shrink-0">🎤</span>
                  <span className="text-sm text-gray-500">Extra Speech</span>
                  {extraSpeeches.length === 0 && (
                    <span className="text-xs text-gray-400 ml-1">— klik + om toe te voegen</span>
                  )}
                </div>
                {extraSpeeches.map((sp, i) => {
                  const spIdx = allMomenten.indexOf(sp)
                  return (
                    <div key={i} className="ml-8 space-y-2 bg-gray-50 rounded-xl p-3 border border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 flex-shrink-0">Speech {i + 1}</span>
                        <button type="button"
                          onClick={() => saveAll(allMomenten.filter((_, idx) => idx !== spIdx))}
                          className="ml-auto text-red-400 hover:text-red-600 text-xs transition-colors">✕</button>
                      </div>
                      <input type="text" value={sp.wie || ''}
                        onChange={e => saveAll(allMomenten.map((m, idx) => idx === spIdx ? { ...m, wie: e.target.value } : m))}
                        placeholder="Wie geeft de speech? (bijv. Getuige, Vader bruid...)"
                        className="w-full bg-white border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all" />
                      <KeuzeSelect opties={EXTRA_SPEECH_OPTIES} value={sp.uur}
                        onChange={v => saveAll(allMomenten.map((m, idx) => idx === spIdx ? { ...m, uur: v } : m))} />
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Vrij extra moment toevoegen */}
      <button type="button" onClick={addExtra}
        className="flex items-center gap-2 text-sm font-medium text-[#007AFF] hover:text-[#0066CC] px-3 py-2 rounded-xl border border-[#007AFF]/30 hover:border-[#007AFF]/60 bg-[#007AFF]/05 transition-all">
        + Ander moment toevoegen
      </button>
    </div>
  )
}

const GENRE_OPTIES = [
  'Swing & Rock\'n\'Roll',
  '70s - 80s Classics',
  'Disco',
  '90s & Eurodance',
  'Ambiance & Foute Muziek',
  'Rock',
  'Dance & House & EDM',
  'Retro',
  'Jump & Hardstyle',
  'Traditionele Dansjes',
]

const MUZIEK_SFEER_OPTIES = [
  'Zomerse Covers',
  'Love Songs',
  'Lounge / Ibiza Stijl',
  'DJ Kiest',
  'Eigen Playlist',
]

function GenreSelector({ label, sublabel, pillsValue, onPillsChange, extraValue, onExtraChange }: {
  label: string; sublabel?: string
  pillsValue: string; onPillsChange: (v: string) => void
  extraValue: string; onExtraChange: (v: string) => void
}) {
  const selected = pillsValue ? pillsValue.split(',').map(s => s.trim()).filter(Boolean) : []
  const toggle = (genre: string) => {
    const next = selected.includes(genre)
      ? selected.filter(g => g !== genre)
      : [...selected, genre]
    onPillsChange(next.join(', '))
  }
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {sublabel && <p className="text-xs text-gray-400 mb-2">{sublabel}</p>}
      <div className="flex flex-wrap gap-2">
        {GENRE_OPTIES.map(g => (
          <button key={g} type="button" onClick={() => toggle(g)}
            className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
              selected.includes(g)
                ? 'border-[#007AFF] bg-[#007AFF] text-white'
                : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
            }`}>
            {g}
          </button>
        ))}
      </div>
      <input type="text" value={extraValue} onChange={e => onExtraChange(e.target.value)}
        placeholder="Andere genres of opmerkingen..."
        className="mt-2 w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all" />
    </div>
  )
}

function StepMuziek({ form, setForm, isTrouw }: { form: FormState; setForm: (u: Partial<FormState>) => void; isTrouw: boolean }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5">
        <GenreSelector
          label="🎵 Top Genres" sublabel="Genres waar jullie van houden — selecteer of typ zelf"
          pillsValue={form.top_genres || ''} onPillsChange={v => setForm({ top_genres: v })}
          extraValue={form.top_genres_extra || ''} onExtraChange={v => setForm({ top_genres_extra: v })}
        />
        <GenreSelector
          label="🚫 Flop Genres" sublabel="Genres die jullie liever niet horen"
          pillsValue={form.flop_genres || ''} onPillsChange={v => setForm({ flop_genres: v })}
          extraValue={form.flop_genres_extra || ''} onExtraChange={v => setForm({ flop_genres_extra: v })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FormField label="✅ Must Play" sublabel="Nummers die zeker moeten draaien">
          <Textarea value={form.must_play || ''} onChange={v => setForm({ must_play: v })} placeholder="Bijv. Dancing Queen, Mr. Brightside, ..." rows={3} />
        </FormField>
        <FormField label="❌ Do Not Play" sublabel="Nummers die absoluut niet mogen">
          <Textarea value={form.do_not_play || ''} onChange={v => setForm({ do_not_play: v })} placeholder="Bijv. ..." rows={3} />
        </FormField>
      </div>
      <FormField label="🎧 Spotify Playlist" sublabel="Deel een playlist als inspiratie voor de sfeer">
        <Input value={form.spotify_link || ''} onChange={v => setForm({ spotify_link: v })} placeholder="https://open.spotify.com/playlist/..." />
      </FormField>

      {/* Muziek tijdens receptie */}
      <FormField label="🥂 Muziek tijdens Receptie" sublabel="Welke sfeer tijdens de receptie?">
        <div className="flex flex-wrap gap-2 mb-2">
          {MUZIEK_SFEER_OPTIES.map(opt => (
            <button key={opt} type="button"
              onClick={() => setForm({ muziek_receptie: form.muziek_receptie === opt ? '' : opt })}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                form.muziek_receptie === opt
                  ? 'border-[#007AFF] bg-[#007AFF] text-white'
                  : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
              }`}>
              {opt}
            </button>
          ))}
        </div>
        <Input value={form.muziek_receptie_extra || ''} onChange={v => setForm({ muziek_receptie_extra: v })} placeholder="Bijv. zaal zorgt voor muziek, muzikant aanwezig, ..." />
      </FormField>

      {/* Muziek tijdens diner */}
      <FormField label="🍽️ Muziek tijdens Diner" sublabel="Welke sfeer wil je tijdens het eten?">
        <div className="flex flex-wrap gap-2 mb-2">
          {MUZIEK_SFEER_OPTIES.map(opt => (
            <button key={opt} type="button"
              onClick={() => setForm({ muziek_diner: form.muziek_diner === opt ? '' : opt })}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                form.muziek_diner === opt
                  ? 'border-[#007AFF] bg-[#007AFF] text-white'
                  : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
              }`}>
              {opt}
            </button>
          ))}
        </div>
        <Input value={form.muziek_diner_extra || ''} onChange={v => setForm({ muziek_diner_extra: v })} placeholder="Bijv. zaal zorgt voor muziek, muzikant aanwezig, ..." />
      </FormField>

      <FormField label="🎤 Verzoeknummers" sublabel="Mogen gasten tijdens de avond zelf nummers aanvragen?">
        <div className="grid grid-cols-3 gap-2">
          {(['Ja', 'Nee', 'Enkel binnen genre'] as const).map(opt => (
            <button key={opt} type="button"
              onClick={() => setForm({ verzoeknummers: opt })}
              className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                (form.verzoeknummers || 'Ja') === opt
                  ? 'border-[#007AFF] bg-[#007AFF]/08 text-[#007AFF]'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}>
              {opt}
            </button>
          ))}
        </div>
      </FormField>

      {isTrouw ? (
        <>
          <div className="pt-2 pb-1">
            <h3 className="text-sm font-semibold text-pink-500 flex items-center gap-2"><Heart size={14} /> Romantische Momenten</h3>
            <p className="text-xs text-gray-400 mt-1">De speciale nummers voor jullie grote dag</p>
          </div>

          {/* Intredes in de zaal — checklist */}
          <div className="bg-pink-50 border border-pink-200 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-semibold text-pink-600">🚶 Intredes in de Zaal</p>
            <p className="text-xs text-pink-500/80">Vink aan welke intredes van toepassing zijn en vul het nummer in</p>
            {[
              { key: 'intrede_eretafel_nummer', label: 'Eretafel', placeholder: 'Artiest - Nummer' },
              { key: 'intrede_bridesmaids_nummer', label: 'Bridesmaids', placeholder: 'Artiest - Nummer' },
              { key: 'intrede_groomsmen_nummer', label: 'Groomsmen', placeholder: 'Artiest - Nummer' },
              { key: 'intrede_koppel_nummer', label: 'Koppel', placeholder: 'Artiest - Nummer' },
              { key: 'intrede_anders_nummer', label: 'Overige intrede', placeholder: 'Bijv. "Vrienden van bruid — Artiest - Nummer"' },
            ].map(({ key, label, placeholder }) => {
              const fieldKey = key as keyof FormState
              const raw = (form[fieldKey] as string) || ''
              const checked = raw !== '' && raw !== 'n.v.t.'
              const displayVal = raw === '__checked__' ? '' : raw
              return (
                <div key={key} className="space-y-1.5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        checked ? 'border-pink-500 bg-pink-500' : 'border-pink-300 bg-white'
                      }`}
                      onClick={() => {
                        if (checked) setForm({ [fieldKey]: '' } as Partial<FormState>)
                        else setForm({ [fieldKey]: '__checked__' } as Partial<FormState>)
                      }}
                    >
                      {checked && <CheckCircle2 size={12} className="text-white" />}
                    </div>
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                  </label>
                  {checked && (
                    <div className="ml-8">
                      <Input
                        value={displayVal}
                        onChange={v => setForm({ [fieldKey]: v || '__checked__' } as Partial<FormState>)}
                        placeholder={placeholder}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Andere speciale momenten */}
          <div className="bg-pink-50 border border-pink-200 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-semibold text-pink-600">💃 Andere Speciale Momenten</p>

            {/* Intrede van de Taart — checkbox */}
            {(() => {
              const raw = form.intrede_taart_nummer || ''
              const checked = raw !== '' && raw !== 'n.v.t.'
              const displayVal = raw === '__checked__' ? '' : raw
              return (
                <div className="space-y-1.5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${checked ? 'border-pink-500 bg-pink-500' : 'border-pink-300 bg-white'}`}
                      onClick={() => setForm({ intrede_taart_nummer: checked ? '' : '__checked__' })}>
                      {checked && <CheckCircle2 size={12} className="text-white" />}
                    </div>
                    <span className="text-sm font-medium text-gray-700">Intrede van de Taart</span>
                  </label>
                  {checked && (
                    <div className="ml-8">
                      <Input value={displayVal} onChange={v => setForm({ intrede_taart_nummer: v || '__checked__' })} placeholder="Artiest - Nummer" />
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Openingsdans */}
            {(() => {
              const raw = form.openingsdans_nummer || ''
              const checked = raw !== '' && raw !== 'n.v.t.'
              const displayVal = raw === '__checked__' ? '' : raw
              return (
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${checked ? 'border-pink-500 bg-pink-500' : 'border-pink-300 bg-white'}`}
                      onClick={() => setForm({ openingsdans_nummer: checked ? '' : '__checked__' })}>
                      {checked && <CheckCircle2 size={12} className="text-white" />}
                    </div>
                    <span className="text-sm font-medium text-gray-700">💃 Openingsdans</span>
                  </label>
                  {checked && (
                    <div className="ml-8 space-y-3">
                      <Input value={displayVal} onChange={v => setForm({ openingsdans_nummer: v || '__checked__' })} placeholder="Artiest - Nummer" />
                      {/* Na de openingsdans — multi-select */}
                      {(() => {
                        // Parse multi-select: stored as JSON array [{key, nummer}]
                        // Format: MULTI:[{"key":"tweede_dans","nummer":"..."},...]
                        const raw2 = form.tweede_dans_nummer || ''
                        type NaDans = { key: string; nummer: string }
                        let selections: NaDans[] = []
                        try {
                          if (raw2.startsWith('MULTI:')) {
                            selections = JSON.parse(raw2.slice(6)) as NaDans[]
                          }
                        } catch { selections = [] }

                        const OPTIES_NA_DANS = [
                          { key: 'tweede_dans', label: 'Tweede dans (met ouders)', hasNummer: true, placeholder: 'Artiest - Nummer voor tweede dans' },
                          { key: 'derde_dans', label: 'Derde dans (met andere gasten)', hasNummer: true, placeholder: 'Artiest - Nummer voor derde dans' },
                          { key: 'direct_feest', label: 'Direct beginnen met het feest', hasNummer: false, placeholder: '' },
                          { key: 'dj_kiest', label: 'DJ kiest zelf', hasNummer: false, placeholder: '' },
                          { key: 'eigen_nummer', label: 'Eigen nummer', hasNummer: true, placeholder: 'Artiest - Nummer' },
                        ]

                        const isSelected = (key: string) => selections.some(s => s.key === key)
                        const getNummer = (key: string) => selections.find(s => s.key === key)?.nummer || ''

                        const toggle = (key: string) => {
                          let updated: NaDans[]
                          if (isSelected(key)) {
                            updated = selections.filter(s => s.key !== key)
                          } else {
                            updated = [...selections, { key, nummer: '' }]
                          }
                          setForm({ tweede_dans_nummer: updated.length ? `MULTI:${JSON.stringify(updated)}` : '' })
                        }

                        const setNummer = (key: string, nummer: string) => {
                          const updated = selections.map(s => s.key === key ? { ...s, nummer } : s)
                          setForm({ tweede_dans_nummer: `MULTI:${JSON.stringify(updated)}` })
                        }

                        return (
                          <div>
                            <p className="text-xs font-medium text-pink-600 mb-2">Na de openingsdans… (meerdere mogelijk)</p>
                            <div className="space-y-2">
                              {OPTIES_NA_DANS.map(opt => {
                                const sel = isSelected(opt.key)
                                return (
                                  <div key={opt.key} className="space-y-1.5">
                                    <button type="button"
                                      onClick={() => toggle(opt.key)}
                                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-left text-xs font-medium ${
                                        sel ? 'border-pink-400 bg-pink-100 text-pink-700' : 'border-pink-200 bg-white text-gray-600 hover:border-pink-300'
                                      }`}>
                                      <div className={`w-3.5 h-3.5 rounded border-2 flex-shrink-0 flex items-center justify-center ${sel ? 'border-pink-500 bg-pink-500' : 'border-gray-300'}`}>
                                        {sel && <CheckCircle2 size={10} className="text-white" />}
                                      </div>
                                      {opt.label}
                                    </button>
                                    {sel && opt.hasNummer && (
                                      <div className="ml-5">
                                        <Input
                                          value={getNummer(opt.key)}
                                          onChange={v => setNummer(opt.key, v)}
                                          placeholder={opt.placeholder}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Boeket Werpen — checkbox */}
            {(() => {
              const raw = form.boeket_werpen_nummer || ''
              const checked = raw !== '' && raw !== 'n.v.t.'
              const displayVal = raw === '__checked__' ? '' : raw
              return (
                <div className="space-y-1.5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${checked ? 'border-pink-500 bg-pink-500' : 'border-pink-300 bg-white'}`}
                      onClick={() => setForm({ boeket_werpen_nummer: checked ? '' : '__checked__' })}>
                      {checked && <CheckCircle2 size={12} className="text-white" />}
                    </div>
                    <span className="text-sm font-medium text-gray-700">Boeket Werpen</span>
                  </label>
                  {checked && (
                    <div className="ml-8">
                      <Input value={displayVal} onChange={v => setForm({ boeket_werpen_nummer: v || '__checked__' })} placeholder="Artiest - Nummer" />
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Hoe wil je het feest afsluiten — alleen bij trouw */}
          <FormField label="🌙 Het Perfecte Einde" sublabel="Hoe wil je dat de avond wordt afgesloten? Meerdere opties mogelijk.">
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'einde_openingsdans', label: '💃 Openingsdans herhalen' },
                { key: 'einde_slow', label: '🥂 Slow voor de overblijvers' },
                { key: 'einde_meezinger', label: '🎤 Meezinger voor de overblijvers' },
                { key: 'einde_urbanus', label: '😄 Urbanus - Ge moogt naar huis gaan' },
                { key: 'einde_rustig', label: '🎵 Rustig afbouwen' },
              ].map(({ key, label }) => {
                const einde = form.einde_feest || ''
                const actief = einde.split(',').map(s => s.trim()).includes(key)
                const toggle = () => {
                  const huidig = einde.split(',').map(s => s.trim()).filter(Boolean)
                  const nieuw = actief ? huidig.filter(k => k !== key) : [...huidig, key]
                  setForm({ einde_feest: nieuw.join(', ') })
                }
                return (
                  <button key={key} type="button" onClick={toggle}
                    className={`px-3 py-2 rounded-full border text-xs font-medium transition-all ${
                      actief
                        ? 'border-[#007AFF] bg-[#007AFF] text-white'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                    }`}>
                    {label}
                  </button>
                )
              })}
            </div>
          </FormField>
        </>
      ) : (
        <>
          <FormField label="🎂 Verjaardagswensen" sublabel="Naam van de jarige en leeftijd (voor het speciale moment!)">
            <Input value={form.verjaardag_naam_leeftijd || ''} onChange={v => setForm({ verjaardag_naam_leeftijd: v })} placeholder="Bijv. Marie - 50 jaar" />
          </FormField>

          {/* Openingsdans bij algemeen feest */}
          {(() => {
            const raw = form.openingsdans_nummer || ''
            const checked = raw !== '' && raw !== 'n.v.t.'
            const displayVal = raw === '__checked__' ? '' : raw
            return (
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${checked ? 'border-[#007AFF] bg-[#007AFF]' : 'border-gray-300 bg-white'}`}
                    onClick={() => setForm({ openingsdans_nummer: checked ? '' : '__checked__' })}>
                    {checked && <CheckCircle2 size={12} className="text-white" />}
                  </div>
                  <span className="text-sm font-medium text-gray-700">💃 Openingsdans</span>
                </label>
                {checked && (
                  <div className="ml-8">
                    <Input value={displayVal} onChange={v => setForm({ openingsdans_nummer: v || '__checked__' })} placeholder="Artiest - Nummer" />
                  </div>
                )}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}

type UploadBestand = { naam: string; type: string; key: string; category?: 'uitnodiging' | 'zaal_foto' | 'grondplan' }
type ZaalFoto = UploadBestand

function parseZaalFotos(raw?: string): ZaalFoto[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

function parseUploadBestanden(raw?: string): UploadBestand[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

const API_ROOT = import.meta.env.VITE_API_URL || ''

function UitnodigingUpload({ form, setForm }: { form: FormState; setForm: (u: Partial<FormState>) => void }) {
  const bestanden = parseUploadBestanden(form.uitnodiging_files)
  const [uploading, setUploading] = useState(false)

  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    const allowed = Array.from(files).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf')
    if (allowed.length === 0) return
    setUploading(true)
    const newFiles: UploadBestand[] = []
    for (const file of allowed) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API_ROOT}/api/uploads`, { method: 'POST', body: fd })
      const data = await res.json() as { key: string; naam: string; type: string }
      newFiles.push({ naam: data.naam, type: data.type, key: data.key, category: 'uitnodiging' })
    }
    setForm({ uitnodiging_files: JSON.stringify([...bestanden, ...newFiles]) })
    setUploading(false)
  }

  const remove = (idx: number) => {
    const updated = bestanden.filter((_, i) => i !== idx)
    setForm({ uitnodiging_files: updated.length ? JSON.stringify(updated) : '' })
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
      <p className="text-sm font-semibold text-purple-800">💌 Uitnodiging uploaden</p>
      <p className="text-sm text-purple-700 leading-relaxed">
        Upload hier jullie uitnodiging als foto of PDF. Dit helpt om stijl, namen en timing goed te begrijpen.
      </p>
      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-purple-300 hover:border-purple-400 bg-white rounded-xl px-4 py-5 cursor-pointer transition-colors">
        <span className="text-2xl">{uploading ? '⏳' : '📂'}</span>
        <span className="text-sm font-semibold text-purple-700">{uploading ? 'Uploaden...' : 'Upload uitnodiging'}</span>
        <span className="text-xs text-gray-400">Afbeelding of PDF</span>
        <input type="file" multiple accept="image/*,application/pdf" className="hidden" disabled={uploading} onChange={e => handleFiles(e.target.files)} />
      </label>
      {bestanden.length > 0 && (
        <div className="space-y-2">
          {bestanden.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-white border border-purple-200 rounded-xl px-3 py-2">
              <span className="text-lg">{f.type.startsWith('image/') ? '🖼️' : '📄'}</span>
              <span className="flex-1 text-xs text-gray-700 truncate"><span className="font-semibold text-purple-600">Uitnodiging · </span>{f.naam}</span>
              <button type="button" onClick={() => remove(i)} className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors">Verwijder</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StepZaal({ form, setForm }: { form: FormState; setForm: (u: Partial<FormState>) => void }) {
  const fotos = parseZaalFotos(form.zaal_fotos)
  const [uploading, setUploading] = useState(false)

  const handleFiles = async (files: FileList | null, category: 'zaal_foto' | 'grondplan' = 'zaal_foto') => {
    if (!files) return
    const allowed = Array.from(files).filter(f =>
      f.type.startsWith('image/') || f.type === 'application/pdf'
    )
    if (allowed.length === 0) return
    setUploading(true)
    const newFotos: ZaalFoto[] = []
    for (const file of allowed) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API_ROOT}/api/uploads`, { method: 'POST', body: fd })
      const data = await res.json() as { key: string; naam: string; type: string }
      newFotos.push({ naam: data.naam, type: data.type, key: data.key, category })
    }
    setForm({ zaal_fotos: JSON.stringify([...fotos, ...newFotos]) })
    setUploading(false)
  }

  const removeFoto = (idx: number) => {
    const updated = fotos.filter((_, i) => i !== idx)
    setForm({ zaal_fotos: updated.length ? JSON.stringify(updated) : '' })
  }

  return (
    <div className="space-y-5">
      <FormField label="Naam Feestzaal / Locatie">
        <Input value={form.locatie_naam || ''} onChange={v => setForm({ locatie_naam: v })} placeholder="Feestzaal De Roos" />
      </FormField>

      <FormField label="Adres van de Zaal" sublabel="Straat, nummer, postcode en gemeente">
        <Input value={form.locatie_adres || ''} onChange={v => setForm({ locatie_adres: v })} placeholder="Kerkstraat 12, 9000 Gent" />
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <FormField label="Contactpersoon Zaal" sublabel="Naam + telefoon/e-mailadres van de zaalverantwoordelijke">
          <Textarea value={form.zaal_contact || ''} onChange={v => setForm({ zaal_contact: v })} placeholder="Jan Janssen — 0478 xx xx xx" rows={2} />
        </FormField>
        <FormField label="Geluidsbeperking" sublabel="Is er een geluidslimiet of tijdsbeperking?">
          <Textarea value={form.geluidsbeperking_info || ''} onChange={v => setForm({ geluidsbeperking_info: v })} placeholder="Bijv. Max 95dB, muziek stopt om 01:00, ..." rows={2} />
        </FormField>
      </div>
      <FormField label={<span className="flex items-center gap-2"><Wifi size={14} className="text-blue-400" /> Wifi Code</span> as unknown as string}>
        <Input value={form.wifi_code || ''} onChange={v => setForm({ wifi_code: v })} placeholder="Naam: ... / Wachtwoord: ..." />
      </FormField>

      {/* Locatie Visueel — foto upload */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
        <p className="text-sm font-semibold text-blue-800">📸 Helpt u mij met de voorbereiding?</p>
        <p className="text-sm text-blue-700 leading-relaxed">
          Upload hier indien mogelijk een foto van de zaal én een grondplan/indeling waarop duidelijk is waar de DJ moet komen.
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          {([
            ['zaal_foto', '📸', 'Foto van de zaal', 'Foto’s van de ruimte/opstelling'],
            ['grondplan', '🗺️', 'Grondplan DJ-plek', 'Duid aan waar de DJ moet staan'],
          ] as const).map(([category, icon, title, subtitle]) => (
            <label key={category}
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-blue-300 hover:border-blue-400 bg-white rounded-xl px-4 py-5 cursor-pointer transition-colors text-center"
              onDragOver={e => { e.preventDefault() }}
              onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files, category) }}
            >
              <span className="text-2xl">{uploading ? '⏳' : icon}</span>
              <span className="text-sm font-semibold text-blue-700">{uploading ? 'Uploaden...' : title}</span>
              <span className="text-xs text-gray-400">{subtitle}</span>
              <input type="file" multiple accept="image/*,application/pdf" className="hidden" disabled={uploading} onChange={e => handleFiles(e.target.files, category)} />
            </label>
          ))}
        </div>

        {/* Bestandslijst */}
        {fotos.length > 0 && (
          <div className="space-y-2">
            {fotos.map((f, i) => (
              <div key={i} className="flex items-center gap-3 bg-white border border-blue-200 rounded-xl px-3 py-2">
                <span className="text-lg">{f.type.startsWith('image/') ? '🖼️' : '📄'}</span>
                <span className="flex-1 text-xs text-gray-700 truncate">{f.naam}</span>
                <button type="button" onClick={() => removeFoto(i)}
                  className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors">
                  Verwijder
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logistiek blok */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-4">
        <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">🚗 Logistiek (Cruciaal voor de DJ!)</p>
        <FormField label="Parkeren & Laden/Lossen" sublabel="Is er een gereserveerde parkeerplaats voor de DJ? Hoe bereikt hij/zij de zaal?">
          <Textarea
            value={form.parkeren_info || ''}
            onChange={v => setForm({ parkeren_info: v })}
            placeholder="Bijv. Parkeerplaats gereserveerd achter de zaal, ingang via de zijdeur..."
            rows={2}
          />
        </FormField>
        <FormField label="Toegankelijkheid Zaal">
          <div className="grid grid-cols-2 gap-3">
            <button type="button"
              onClick={() => setForm({ gelijkvloers: 1 })}
              className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                (form.gelijkvloers ?? 1) === 1
                  ? 'border-[#007AFF] bg-[#007AFF]/08 text-[#007AFF]'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}>
              🏠 Gelijkvloers
            </button>
            <button type="button"
              onClick={() => setForm({ gelijkvloers: 0 })}
              className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                form.gelijkvloers === 0
                  ? 'border-[#007AFF] bg-[#007AFF]/08 text-[#007AFF]'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
              }`}>
              🏢 Verdieping / Lift
            </button>
          </div>
        </FormField>
      </div>

    </div>
  )
}

function StepExtras({ form, setForm, isTrouw }: { form: FormState; setForm: (u: Partial<FormState>) => void; isTrouw: boolean }) {
  const getValue = (key: string) => !!(form as Record<string, unknown>)[key]
  const setValue = (key: string, v: boolean) => setForm({ [key]: v ? 1 : 0 })

  return (
    <div className="space-y-4">
      {/* Sectie: Wat voorziet de DJ */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Wat voorziet de DJ?</p>
        <p className="text-xs text-gray-400 mb-3">Selecteer wat de DJ meebrengt naar het feest</p>
        <div className="space-y-2">
          {DJ_VOORZIENINGEN.map(item => {
            const active = getValue(item.key)
            return (
              <button key={item.key} type="button"
                onClick={() => setValue(item.key, !active)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                  active ? item.active : 'bg-white border-gray-200 hover:border-gray-300'
                }`}>
                <span className="text-xl flex-shrink-0">{item.emoji}</span>
                <span className={`font-semibold text-sm flex-1 ${active ? 'text-gray-900' : 'text-gray-500'}`}>{item.label}</span>
                {active && <CheckCircle2 size={16} className="text-[#007AFF] flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sectie: Extra services */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Extra services</p>
        <p className="text-xs text-gray-400 mb-3">Boek extra's om jouw feest compleet te maken</p>
        <div className="space-y-2">
          {EXTRAS.filter(extra => isTrouw || extra.key !== 'ceremonie_set').map(extra => {
            const active = getValue(extra.key)
            const isOpAanvraag = 'opAanvraag' in extra && extra.opAanvraag
            return (
              <button key={extra.key} type="button"
                onClick={() => !isOpAanvraag && setValue(extra.key, !active)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                  isOpAanvraag ? 'bg-white border-gray-200 cursor-default' :
                  active ? extra.active : 'bg-white border-gray-200 hover:border-gray-300'
                }`}>
                <span className="text-xl flex-shrink-0">{extra.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-sm ${active ? 'text-gray-900' : 'text-gray-500'}`}>{extra.label}</div>
                  <div className="text-xs text-gray-400">{extra.desc}</div>
                </div>
                {/* Prijs badge */}
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  {isOpAanvraag ? (
                    <a href={'aanvraagLink' in extra ? extra.aanvraagLink : '#'}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-xs font-medium text-[#007AFF] bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors">
                      Op aanvraag →
                    </a>
                  ) : (
                    <>
                      <span className={`text-sm font-bold ${active ? 'text-gray-900' : 'text-gray-400'}`}>
                        + € {extra.prijs}
                      </span>
                      {active && <CheckCircle2 size={16} className="text-[#007AFF]" />}
                    </>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const DJ_INFO = { naam: 'Den Tandt Kwinten (DJ Kwinten)', adres: 'Loskaai 26, 9800 Grammene', telefoon: '0498/21 64 48', email: 'DJKWINTEN@gmail.com', btw: 'BE 0726.773.488' }
const VOORWAARDEN = [
  { titel: '1. Akkoord via Betaling', tekst: 'Door betaling van het voorschot van € 100,00 verklaart de opdrachtgever zich akkoord met deze volledige overeenkomst.' },
  { titel: '2. Annulering', tekst: 'Als het feest door onvoorziene omstandigheden niet kan plaatsvinden, zal de organisator de DJ zo snel mogelijk op de hoogte brengen. Kosteloos annuleren tot 21 dagen voor het feest. Het voorschot kan in overleg worden omgezet in een waardebon. Bij latere annulering geldt het voorschot als schadevergoeding (uitgezonderd overmacht).' },
  { titel: '3. Auteursrechten', tekst: 'De organisator is verantwoordelijk voor Sabam/Unisono (meestal gedekt door de zaal bij privéfeesten).' },
  { titel: '4. Aansprakelijkheid', tekst: 'De DJ is niet aansprakelijk voor schade, verlies of diefstal van persoonlijke bezittingen van gasten, noch voor schade aan het evenemententerrein veroorzaakt door derden.' },
  { titel: '5. Verzekeringen, Schade & Veiligheid', tekst: 'De organisator beschikt over een polis burgerlijke aansprakelijkheid. De DJ is verzekerd voor schade die hij zelf aan derden veroorzaakt. Schade of diefstal van apparatuur door derden (gasten, bezoekers, dieren…) valt niet onder de DJ-verzekering. Opzettelijke of nalatige schade (bijv. mic drops, beschadiging uplights, morsen van drank) wordt verhaald op de organisator.' },
  { titel: '6. Voorzieningen', tekst: 'Voldoende tafels aanwezig voor drank/consumpties. Apparatuur van de DJ (luidsprekers, booth, mengpanelen, flightcases) mag niet als tafel of afzetruimte gebruikt worden.' },
  { titel: '7. Varia', tekst: 'Consumpties voor de DJ op kosten van de organisator, alsook een warme maaltijd indien het aanvangsuur voor 20u ligt. De DJ-prestaties zijn vrijgesteld van BTW (art. 44§2,8°).' },
  { titel: '8. Beeldmateriaal', tekst: 'De DJ heeft het recht om tijdens het evenement foto- en video-opnames te maken voor veiligheids- en bewijsdoeleinden (bijv. bij schade of incidenten). Deze worden niet openbaar gemaakt. Gebruik voor promotionele doeleinden enkel met voorafgaande toestemming van de organisator.' },
]

const EXTRA_LABELS: Record<string, string> = {
  ceremonie_set: 'Ceremonie Set',
  digital_booth: 'Digitale Photobooth',
  retro_booth: 'Photobooth met Prints',
  draadloze_speaker: 'Extra Luidspreker',
  karaoke: 'Karaoke',
}

function StepBevestiging({ form, setForm, gdprAccepted, setGdprAccepted, questionnaireOnly = false }: {
  form: FormState
  setForm: (u: Partial<FormState>) => void
  gdprAccepted: boolean
  setGdprAccepted: (v: boolean) => void
  questionnaireOnly?: boolean
}) {
  let datumStr = '—'
  try {
    if (form.feest_datum) {
      datumStr = new Date(form.feest_datum).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    }
  } catch { datumStr = form.feest_datum || '—' }

  if (questionnaireOnly) {
    return (
      <div className="space-y-5">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="font-bold text-blue-800 text-sm">📋 Vragenlijst afronden</p>
          <p className="text-sm text-blue-700 mt-1 leading-relaxed">
            Controleer nog even of alle praktische info, planning en muziekwensen correct zijn. Na het indienen ontvangt DJ Kwinten de ingevulde vragenlijst.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Aanvullende vragen of opmerkingen?</label>
          <textarea
            value={form.opmerkingen || ''}
            onChange={e => setForm({ opmerkingen: e.target.value })}
            placeholder="Optioneel — stel gerust uw vragen of geef aanvullende informatie..."
            rows={4}
            className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-4 py-3 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all resize-none"
          />
        </div>

        <label className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={gdprAccepted}
            onChange={e => setGdprAccepted(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#007AFF]"
          />
          <span className="text-sm text-gray-600 leading-relaxed">
            Ik bevestig dat de ingevulde informatie correct is en gebruikt mag worden om mijn event voor te bereiden.
          </span>
        </label>
      </div>
    )
  }

  // Bereken richtprijs — Number() overal om string-from-DB te voorkomen
  const basisprijs = Number(form.basisprijs) || 0
  let extraPrijzenDJ: Record<string, number> = {}
  try { extraPrijzenDJ = JSON.parse(form.extra_prijzen || '{}') } catch {}
  const korting = Number(extraPrijzenDJ['_korting']) || 0
  // Gebruik vaste prijzen uit EXTRAS als fallback (tenzij DJ een andere prijs heeft ingesteld)
  const EXTRAS_PRIJZEN: Record<string, number> = Object.fromEntries(
    EXTRAS.filter(e => e.prijs !== null).map(e => [e.key, e.prijs as number])
  )
  const geselecteerdeExtras = Object.entries(EXTRA_LABELS)
    .filter(([key]) => form[key as keyof FormState])
    .map(([key, label]) => ({
      key, label,
      prijs: Number(extraPrijzenDJ[key] ?? EXTRAS_PRIJZEN[key] ?? 0),
      opAanvraag: EXTRAS.find(e => e.key === key)?.prijs === null,
    }))
  const geselecteerdeVoorzieningen = DJ_VOORZIENINGEN
    .filter(item => form[item.key as keyof FormState])
    .map(item => item.label)
  const extrasTotal = geselecteerdeExtras.reduce((s, e) => s + (e.opAanvraag ? 0 : e.prijs), 0)
  const totaalPrijs = Math.max(0, basisprijs + extrasTotal - korting)
  const heeftRichtprijs = basisprijs > 0 || geselecteerdeExtras.some(e => !e.opAanvraag)

  return (
    <div className="space-y-5">

      {/* Contract samenvatting */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#007AFF] px-4 py-3">
          <p className="text-white font-bold text-sm">📄 OVEREENKOMST DJ KWINTEN</p>
          <p className="text-white/70 text-xs mt-0.5">Lees aandachtig voor u akkoord gaat</p>
        </div>

        <div className="p-4 space-y-4 bg-white">
          {/* Partijen */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-xs font-bold text-[#007AFF] mb-1">DJ</p>
              <p className="text-xs text-gray-700 font-medium">{DJ_INFO.naam}</p>
              <p className="text-xs text-gray-500">{DJ_INFO.adres}</p>
              <p className="text-xs text-gray-500">{DJ_INFO.telefoon}</p>
              <p className="text-xs text-gray-500">BTW: {DJ_INFO.btw}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-500 mb-1">OPDRACHTGEVER</p>
              {(form.naam_partner1 || form.naam_partner2) && (
                <p className="text-xs text-pink-600 font-semibold mb-1">
                  💍 {[form.naam_partner1, form.naam_partner2].filter(Boolean).join(' & ')}
                </p>
              )}
              <p className="text-xs text-gray-700 font-medium">{form.naam_organisator || '—'}</p>
              {form.bedrijfsnaam && <p className="text-xs text-gray-500">{form.bedrijfsnaam}</p>}
              {form.btw_nr && <p className="text-xs text-gray-500">BTW: {form.btw_nr}</p>}
              <p className="text-xs text-gray-500">{form.email || '—'}</p>
              <p className="text-xs text-gray-500">{form.telefoon || '—'}</p>
            </div>
          </div>

          {/* Feestgegevens */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Feestgegevens</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <div className="rounded-lg bg-white/70 border border-gray-100 p-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Datum</p>
                <p className="text-xs font-medium text-gray-800 capitalize mt-0.5">{datumStr}</p>
              </div>
              <div className="rounded-lg bg-white/70 border border-gray-100 p-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Type feest</p>
                <p className="text-xs font-medium text-gray-800 mt-0.5">{form.type_feest || '—'}</p>
              </div>
              <div className="rounded-lg bg-white/70 border border-gray-100 p-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Locatie</p>
                <p className="text-xs font-medium text-gray-800 mt-0.5">{form.locatie_naam || '—'}</p>
              </div>
              <div className="rounded-lg bg-white/70 border border-gray-100 p-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Adres zaal</p>
                <p className="text-xs font-medium text-gray-800 mt-0.5">{form.locatie_adres || '—'}</p>
              </div>
              <div className="rounded-lg bg-white/70 border border-gray-100 p-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Aantal gasten</p>
                <p className="text-xs font-medium text-gray-800 mt-0.5">{form.aantal_gasten ? `${form.aantal_gasten} personen` : '—'}</p>
              </div>
              <div className="rounded-lg bg-white/70 border border-gray-100 p-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Gewenste start dansfeest</p>
                <p className="text-xs font-medium text-gray-800 mt-0.5">{form.uur_dansfeest || '—'}</p>
              </div>
            </div>
          </div>

          {/* Voorzieningen en extra's */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Voorzieningen & extra's</p>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Voorzieningen</p>
              <p className="text-xs text-gray-700 leading-relaxed">{geselecteerdeVoorzieningen.length ? geselecteerdeVoorzieningen.join(', ') : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Extra's</p>
              <p className="text-xs text-gray-700 leading-relaxed">{geselecteerdeExtras.length ? geselecteerdeExtras.map(e => e.label).join(', ') : "Geen extra's geselecteerd"}</p>
            </div>
            <p className="text-[10px] text-orange-500 font-medium leading-relaxed">
              Deze voorzieningen en extra's zijn gebaseerd op de huidige informatie en kunnen later in onderling overleg nog aangepast worden.
            </p>
          </div>

          {/* Financieel */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Financiële Afspraken</p>
            {heeftRichtprijs ? (
              <>
                {basisprijs > 0 && (
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Basisprijs</span><span className="font-medium text-gray-800">€ {basisprijs.toFixed(2)}</span></div>
                )}
                {geselecteerdeExtras.map(e => (
                  <div key={e.key} className="flex justify-between text-xs">
                    <span className="text-gray-500">{e.label}</span>
                    {e.opAanvraag ? (
                      <span className="text-blue-500 font-medium italic">op aanvraag</span>
                    ) : (
                      <span className={e.prijs > 0 ? 'text-orange-600 font-medium' : 'text-green-600 font-medium'}>
                        {e.prijs > 0 ? '+ ' : ''}€ {e.prijs.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
                {korting > 0 && (
                  <div className="flex justify-between text-xs text-green-600 font-medium">
                    <span>Korting</span>
                    <span>- € {korting.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-1.5 mt-1">
                  <div className="flex justify-between text-xs font-bold"><span className="text-gray-700">Basisprijs totaal</span><span className="text-gray-900">€ {totaalPrijs.toFixed(2)}</span></div>
                  <p className="text-[10px] text-orange-500 font-medium mt-1">⚠️ Dit is een basisprijs. Bij bijkomende opties of wijzigingen kan de prijs worden aangepast. De uiteindelijke prijs wordt vermeld op het eindoverzicht.</p>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-xs"><span className="text-gray-500">Totaalprijs</span><span className="text-gray-700 italic">Wordt na bevestiging meegedeeld</span></div>
                <p className="text-[10px] text-orange-500 font-medium mt-1">⚠️ De uiteindelijke prijs wordt bepaald na overleg en vermeld op het eindoverzicht.</p>
              </>
            )}
            <div className="border-t border-gray-100 pt-1.5 space-y-1.5 mt-1">
              <div className="flex justify-between text-xs"><span className="text-gray-500">Voorschot (reservatie)</span><span className="font-bold text-[#007AFF]">€ 100,00</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Betaling voorschot</span><span className="text-gray-700">Via Billit factuur (QR-code)</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">Restbedrag</span><span className="text-gray-700">Cash op dag of binnen de 14 dagen na het feest</span></div>
            </div>
          </div>

          {/* Algemene voorwaarden */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Algemene Voorwaarden</p>
            <div className="space-y-2">
              {VOORWAARDEN.map(v => (
                <div key={v.titel} className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-xs font-semibold text-gray-700">{v.titel}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{v.tekst}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Opmerkingen */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Aanvullende vragen of opmerkingen?</label>
        <textarea
          value={form.opmerkingen || ''}
          onChange={e => setForm({ opmerkingen: e.target.value })}
          placeholder="Optioneel — stel gerust uw vragen of geef aanvullende informatie..."
          rows={3}
          className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-4 py-3 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all resize-none"
        />
      </div>

      {/* Toestemming promotioneel beeldmateriaal */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
        <p className="text-sm font-semibold text-amber-800">📷 Toestemming Beeldmateriaal</p>
        <p className="text-xs text-amber-700 leading-relaxed">
          Geeft u de DJ toestemming om foto's en video's gemaakt tijdens het evenement te gebruiken voor promotionele doeleinden (website, sociale media)?
        </p>
        <div className="flex gap-3 mt-1">
          <button type="button"
            onClick={() => setForm({ toestemming_foto: 1 })}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
              form.toestemming_foto === 1
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}>
            {form.toestemming_foto === 1 ? '✅' : '☐'} Ja, ik geef toestemming
          </button>
          <button type="button"
            onClick={() => setForm({ toestemming_foto: 0 })}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
              form.toestemming_foto === 0
                ? 'border-red-400 bg-red-50 text-red-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}>
            {form.toestemming_foto === 0 ? '❌' : '☐'} Nee, geen toestemming
          </button>
        </div>
      </div>

      {/* GDPR */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
        <p className="text-xs font-medium text-gray-500 mb-2">🔒 Privacy (GDPR)</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          Ik ga akkoord met de verwerking van mijn persoonsgegevens (naam, e-mail, telefoon) voor de organisatie van dit feest, conform de{' '}
          <span className="text-[#007AFF]">privacywetgeving (GDPR/AVG)</span>.
          Gegevens worden uitsluitend gebruikt door de DJ en niet gedeeld met derden.
        </p>
      </div>

      {/* Bevestigings-checkbox */}
      <button type="button" onClick={() => setGdprAccepted(!gdprAccepted)}
        className={`flex items-start gap-3 p-4 rounded-2xl border-2 transition-all text-left w-full ${
          gdprAccepted
            ? 'border-[#34C759] bg-green-50'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }`}>
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
          gdprAccepted ? 'border-[#34C759] bg-[#34C759]' : 'border-gray-300'
        }`}>
          {gdprAccepted && <CheckCircle2 size={12} className="text-white" />}
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">
          Ik bevestig dat ik bovenstaande overeenkomst heb gelezen, dat de gegevens correct zijn, en ga akkoord met de voorwaarden en de voorschotfactuur van <span className="font-bold text-gray-800">€ 100</span>.{' '}
          Ik begrijp dat de vermelde prijs een <span className="font-semibold text-orange-600">basisprijs</span> is en dat de uiteindelijke prijs kan worden aangepast naargelang bijkomende opties of wijzigingen. De definitieve prijs wordt meegedeeld op het eindoverzicht.
        </p>
      </button>

    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

const STEPS_TROUW = ['Contact', 'Zaal', 'Voorzieningen', 'Planning', 'Muziek', 'Bevestiging']
const STEPS_ALGEMEEN = ['Contact', 'Zaal', 'Voorzieningen', 'Planning', 'Muziek', 'Bevestiging']

// ─── LocalStorage helpers ──────────────────────────────────────────────────

function lsKey(ref: string) { return `dj-form-${ref}` }

function loadFromStorage(ref: string): Partial<FormState> | null {
  try {
    const raw = localStorage.getItem(lsKey(ref))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveToStorage(ref: string, data: Partial<FormState>) {
  try { localStorage.setItem(lsKey(ref), JSON.stringify(data)) } catch {}
}

function clearStorage(ref: string) {
  try { localStorage.removeItem(lsKey(ref)) } catch {}
}

// ─── Klantportaal ──────────────────────────────────────────────────────────

function CustomerPortal({ booking, onFillForm }: { booking: Booking; onFillForm: () => void }) {
  const isTrouw = booking.type_feest === 'Trouw'
  const dateStr = booking.feest_datum
    ? format(parseISO(booking.feest_datum), 'EEEE d MMMM yyyy', { locale: nl })
    : ''
  const ref = booking.slug || booking.access_token || String(booking.id)
  const [pdfLoading, setPdfLoading] = useState<'contract' | 'factuur' | null>(null)

  const openBase64PDF = (base64: string) => {
    const byteStr = atob(base64)
    const bytes = new Uint8Array(byteStr.length).map((_, i) => byteStr.charCodeAt(i))
    const blob = new Blob([bytes], { type: 'application/pdf' })
    window.open(URL.createObjectURL(blob), '_blank')
  }

  const openPDFOnDemand = async (type: 'contract' | 'factuur') => {
    setPdfLoading(type)
    try {
      const pdf = await getBookingPDF(ref, type)
      if (pdf) openBase64PDF(pdf)
      else alert('PDF niet beschikbaar. Neem contact op met je DJ.')
    } catch {
      alert('PDF laden mislukt. Controleer je verbinding en probeer opnieuw.')
    } finally {
      setPdfLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      {/* Gradient header */}
      <div className={`px-4 pb-10 pt-10 safe-top ${
        isTrouw
          ? 'bg-gradient-to-r from-pink-500 via-rose-400 to-pink-400'
          : 'bg-gradient-to-r from-[#007AFF] via-[#5856D6] to-[#AF52DE]'
      }`}>
        <div className="max-w-lg mx-auto text-center">
          <div className="text-5xl mb-3">{isTrouw ? '💍' : '🎉'}</div>
          <h1 className="text-2xl font-black text-white mb-1">{booking.naam_organisator || 'Jouw Feest'}</h1>
          <p className="text-white/70 text-sm capitalize">{dateStr}</p>
          {booking.locatie_naam && (
            <p className="text-white/60 text-xs mt-1">{booking.type_feest} · {booking.locatie_naam}</p>
          )}
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 -mt-4 pb-10 space-y-4">
        {/* Status kaartjes */}
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Status Overzicht</h2>
          <div className="space-y-3">
            {/* Vragenlijst */}
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${
              booking.status_vragenlijst ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
            }`}>
              <span className="text-xl">{booking.status_vragenlijst ? '✅' : '📋'}</span>
              <div className="flex-1">
                <div className={`text-sm font-semibold ${booking.status_vragenlijst ? 'text-green-700' : 'text-orange-700'}`}>
                  Vragenlijst
                </div>
                <div className={`text-xs ${booking.status_vragenlijst ? 'text-green-600' : 'text-orange-600'}`}>
                  {booking.status_vragenlijst ? 'Ingediend ✓' : 'Nog in te vullen'}
                </div>
              </div>
            </div>

            {/* Contract */}
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${
              booking.status_contract ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
            }`}>
              <span className="text-xl">{booking.status_contract ? '✅' : '📄'}</span>
              <div className="flex-1">
                <div className={`text-sm font-semibold ${booking.status_contract ? 'text-green-700' : 'text-gray-500'}`}>
                  Overeenkomst
                </div>
                <div className={`text-xs ${booking.status_contract ? 'text-green-600' : 'text-gray-400'}`}>
                  {booking.status_contract ? 'Bevestigd ✓' : 'In opmaak'}
                </div>
              </div>
              {booking.status_contract && (booking.contract_pdf || booking.has_contract_pdf) && (
                <button
                  onClick={() => booking.contract_pdf ? openBase64PDF(booking.contract_pdf) : openPDFOnDemand('contract')}
                  disabled={pdfLoading === 'contract'}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#007AFF] bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-60">
                  <FileText size={12} /> {pdfLoading === 'contract' ? '...' : 'PDF'}
                </button>
              )}
            </div>

            {/* Voorschot */}
            <div className={`flex items-center gap-3 p-3 rounded-xl border ${
              booking.status_voorschot ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
            }`}>
              <span className="text-xl">{booking.status_voorschot ? '✅' : '💶'}</span>
              <div className="flex-1">
                <div className={`text-sm font-semibold ${booking.status_voorschot ? 'text-green-700' : 'text-gray-500'}`}>
                  Voorschot € 100
                </div>
                <div className={`text-xs ${booking.status_voorschot ? 'text-green-600' : 'text-gray-400'}`}>
                  {booking.status_voorschot ? 'Ontvangen ✓' : 'Nog te betalen'}
                </div>
              </div>
              {(booking.billit_factuur_pdf || booking.has_billit_factuur_pdf) && (
                <button
                  onClick={() => booking.billit_factuur_pdf ? openBase64PDF(booking.billit_factuur_pdf) : openPDFOnDemand('factuur')}
                  disabled={pdfLoading === 'factuur'}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#007AFF] bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-60">
                  <Download size={12} /> {pdfLoading === 'factuur' ? '...' : 'Factuur'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Vragenlijst actieknop — altijd toegankelijk */}
        <button onClick={() => {
          if (booking.status_vragenlijst) {
            if (!window.confirm('⚠️ Opgelet!\n\nSommige wijzigingen kunnen invloed hebben op de prijs.\n\nWil je toch doorgaan?')) return
          }
          onFillForm()
        }}
          className={`w-full flex items-center justify-between gap-3 p-5 rounded-2xl border-2 transition-all text-left shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] ${
            booking.status_vragenlijst
              ? 'bg-white border-gray-200 hover:border-gray-300 text-gray-900'
              : 'bg-[#007AFF] border-[#007AFF] text-white hover:bg-[#0066CC] hover:border-[#0066CC]'
          }`}>
          <div>
            <div className="font-bold text-base">
              {booking.status_vragenlijst ? 'Vragenlijst aanpassen' : 'Vragenlijst invullen'}
            </div>
            <div className={`text-xs mt-0.5 ${booking.status_vragenlijst ? 'text-gray-400' : 'text-white/80'}`}>
              {booking.status_vragenlijst
                ? 'Pas je gegevens en muziekwensen aan'
                : 'Vul je muziekwensen en praktische info in'}
            </div>
          </div>
          <ChevronRight size={20} className="flex-shrink-0" />
        </button>

        {/* Documenten */}
        {(booking.contract_pdf || booking.has_contract_pdf || booking.billit_factuur_pdf || booking.has_billit_factuur_pdf) && (
          <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">📁 Documenten</h2>
            <div className="space-y-2">
              {(booking.contract_pdf || booking.has_contract_pdf) && (
                <button
                  onClick={() => booking.contract_pdf ? openBase64PDF(booking.contract_pdf) : openPDFOnDemand('contract')}
                  disabled={pdfLoading === 'contract'}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors text-left disabled:opacity-60"
                >
                  <span className="text-xl">📄</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-blue-700">Overeenkomst DJ Kwinten</div>
                    <div className="text-xs text-blue-500">{pdfLoading === 'contract' ? 'Laden...' : 'Klik om te openen of downloaden'}</div>
                  </div>
                  <Download size={16} className="text-blue-500 flex-shrink-0" />
                </button>
              )}
              {(booking.billit_factuur_pdf || booking.has_billit_factuur_pdf) && (
                <button
                  onClick={() => booking.billit_factuur_pdf ? openBase64PDF(booking.billit_factuur_pdf) : openPDFOnDemand('factuur')}
                  disabled={pdfLoading === 'factuur'}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-green-200 bg-green-50 hover:bg-green-100 transition-colors text-left disabled:opacity-60"
                >
                  <span className="text-xl">💳</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-green-700">Voorschotfactuur</div>
                    <div className="text-xs text-green-500">{pdfLoading === 'factuur' ? 'Laden...' : (booking.billit_factuur_naam || 'Klik om te openen of downloaden')}</div>
                  </div>
                  <Download size={16} className="text-green-500 flex-shrink-0" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pt-2 space-y-1">
          <p>Vragen? Neem contact op met je DJ.</p>
          <p>🎧 DJ Manager</p>
        </div>
      </main>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export function CustomerForm() {
  // Accept both /vragenlijst/:slug and /formulier/:id
  const { slug, id } = useParams<{ slug?: string; id?: string }>()
  const [searchParams] = useSearchParams()
  const directMode = searchParams.get('direct') === '1'
  const ref = slug || id || ''

  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [contractBlocked, setContractBlocked] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [portalView, setPortalView] = useState(!directMode)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>({})
  const [gdprAccepted, setGdprAccepted] = useState(false)
  // Feedback popup na submit
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackVragenlijst, setFeedbackVragenlijst] = useState('')
  const [feedbackHerkomst, setFeedbackHerkomst] = useState('')
  const [feedbackHerkomstDetail, setFeedbackHerkomstDetail] = useState('')
  const [feedbackSaving, setFeedbackSaving] = useState(false)
  // Autosave state
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saved' | 'restored'>('idle')
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!ref) return
    getBooking(ref).then(async data => {
      if (!data) { setNotFound(true); setLoading(false); return }
      setBooking(data)
      let contractPatch: Partial<FormState> = {}
      if (directMode) {
        const ci = await getContractInfo(data.id)
        const complete = !!(ci?.naam?.trim() && ci?.email?.trim() && ci?.gsm?.trim() && ci?.klant_adres?.trim() && ci?.event_type?.trim() && ci?.event_datum?.trim() && ci?.locatie_naam?.trim() && ci?.locatie_adres?.trim())
        if (!complete) setContractBlocked(true)
        if (ci) {
          const [partner1, partner2] = (ci.naam || '').split(/\s*&\s*/).map(v => v.trim())
          contractPatch = {
            email: ci.email || data.email,
            telefoon: ci.gsm || data.telefoon,
            adres_organisator: ci.klant_adres || data.adres_organisator,
            type_feest: (ci.event_type || data.type_feest) as Booking['type_feest'],
            feest_datum: ci.event_datum || data.feest_datum,
            locatie_naam: ci.locatie_naam || data.locatie_naam,
            locatie_adres: ci.locatie_adres || data.locatie_adres,
            aantal_gasten: ci.aantal_gasten ?? data.aantal_gasten,
            uur_dansfeest: ci.uur_dansfeest || data.uur_dansfeest,
            speakers_aanwezig: ci.geluid_voorzien,
            licht_aanwezig: ci.licht_voorzien,
            dj_booth_aanwezig: ci.dj_booth_nodig,
            ceremonie_set: ci.ceremonie_set,
            digital_booth: ci.digital_booth,
            retro_booth: ci.retro_booth,
            draadloze_speaker: ci.draadloze_speaker,
            karaoke: ci.karaoke,
          }
          if (data.type_feest === 'Trouw' && ci.naam) {
            contractPatch.naam_partner1 = data.naam_partner1 || partner1 || ''
            contractPatch.naam_partner2 = data.naam_partner2 || partner2 || ''
          } else {
            contractPatch.naam_organisator = ci.naam || data.naam_organisator
          }
        }
      }

      // Try to restore from LocalStorage first
      const saved = loadFromStorage(ref)
      if (saved && Object.keys(saved).length > 5) {
        // Merge: use saved data on top of DB + contract info data
        setForm({ ...data, ...contractPatch, ...saved })
        setAutoSaveStatus('restored')
        setTimeout(() => setAutoSaveStatus('idle'), 4000)
      } else {
        setForm({ ...data, ...contractPatch })
      }
      setLoading(false)
    }).catch(() => {
      setNotFound(true)
      setLoading(false)
    })
  }, [ref])

  const isTrouw = booking?.type_feest === 'Trouw'
  const steps = isTrouw ? STEPS_TROUW : STEPS_ALGEMEEN
  const totalSteps = steps.length

  const updateForm = useCallback((update: Partial<FormState>) => {
    setForm(prev => {
      const next = { ...prev, ...update }
      // Debounced autosave to LocalStorage (1s after last change)
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(() => {
        saveToStorage(ref, next)
        setAutoSaveStatus('saved')
        setTimeout(() => setAutoSaveStatus('idle'), 2000)
      }, 1000)
      return next
    })
  }, [ref])

  const handleSubmit = async () => {
    if (!ref) return
    setSaving(true)
    try {
      const isUpdate = !!(booking?.status_vragenlijst)
      const payload = { ...form } as Record<string, unknown>
      payload._is_update = isUpdate ? 1 : 0
      const result = await submitQuestionnaire(ref, payload as Partial<Booking>) as { success: boolean; error?: string }
      if (!result.success) {
        alert('Er is iets fout gegaan: ' + (result.error || 'Onbekende fout') + '\n\nProbeer opnieuw.')
        setSaving(false)
        return
      }
      clearStorage(ref)
      setSubmitted(true)
      setShowFeedback(true)
      setStep(0)
    } catch (e) {
      console.error(e)
      alert('Er is iets fout gegaan. Controleer je internetverbinding en probeer opnieuw.')
    }
    setSaving(false)
  }

  const HERKOMST_OPTIES = [
    { label: 'Je kent me', detail: false, placeholder: '' },
    { label: 'Mijn website', detail: false, placeholder: '' },
    { label: 'Al horen draaien', detail: true, placeholder: 'Waar? (bv. naam feestzaal)' },
    { label: 'Aangeraden door...', detail: true, placeholder: 'Zaal of persoon' },
  ]

  const handleFeedbackSubmit = async () => {
    if (!feedbackVragenlijst || !feedbackHerkomst) return
    setFeedbackSaving(true)
    try {
      const herkomstTekst = feedbackHerkomstDetail.trim()
        ? `${feedbackHerkomst}: ${feedbackHerkomstDetail.trim()}`
        : feedbackHerkomst
      await submitQuestionnaire(ref, {
        feedback_vragenlijst: feedbackVragenlijst,
        feedback_herkomst: herkomstTekst,
      } as Partial<Booking>)
    } catch { /* feedback save failure is non-critical */ }
    setFeedbackSaving(false)
    setShowFeedback(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center">
      <div className="text-gray-400 animate-pulse">Formulier laden...</div>
    </div>
  )

  if (notFound) return (
    <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">🔍</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Link niet gevonden</h2>
        <p className="text-gray-500 text-sm">Controleer of je de juiste link hebt ontvangen van je DJ. Contacteer hem als je problemen hebt.</p>
      </div>
    </div>
  )

  if (directMode && contractBlocked && booking) return (
    <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm p-6 max-w-sm text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Contract Info eerst invullen</h2>
        <p className="text-sm text-gray-500 mb-5">De vragenlijst wordt pas geopend zodra alle verplichte Contract Info is ingevuld.</p>
        <a href={booking.slug ? `/event/${booking.slug}` : '/'} className="inline-flex bg-[#007AFF] text-white px-4 py-2.5 rounded-xl font-semibold text-sm">Naar klantpagina</a>
      </div>
    </div>
  )

  if (submitted) return (
    <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6 animate-bounce">🎉</div>
        <h2 className="text-3xl font-black text-gray-900 mb-3">Bedankt!</h2>
        <p className="text-gray-600 text-lg mb-2">
          Je vragenlijst is succesvol ingediend.
        </p>
        <p className="text-gray-400 text-sm mb-8">
          Je DJ heeft alle informatie ontvangen en zal jullie feest tot in de puntjes voorbereiden. Bij vragen kan je altijd contact opnemen.
        </p>
        <button
          onClick={() => { setSubmitted(false); setPortalView(true) }}
          className="bg-[#007AFF] hover:bg-[#0066CC] text-white font-semibold px-6 py-3 rounded-xl transition-colors text-sm">
          Bekijk je status →
        </button>
      </div>

      {/* Feedback popup */}
      {showFeedback && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-5">
            <div className="text-center">
              <div className="text-3xl mb-2">🙏</div>
              <h3 className="text-lg font-bold text-gray-900">Nog twee snelle vragen</h3>
              <p className="text-xs text-gray-400 mt-1">Jouw feedback helpt me om de vragenlijst te verbeteren.</p>
            </div>

            {/* Vraag 1 */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Hoe vond je de vragenlijst?</p>
              <div className="flex flex-wrap gap-2">
                {['Goed', 'Duidelijk', 'Moeilijk', 'Te lang'].map(opt => (
                  <button
                    key={opt}
                    onClick={() => setFeedbackVragenlijst(opt)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      feedbackVragenlijst === opt
                        ? 'bg-[#007AFF] text-white border-[#007AFF]'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >{opt}</button>
                ))}
              </div>
            </div>

            {/* Vraag 2 */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Hoe ben je bij DJ Kwinten terechtgekomen?</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {HERKOMST_OPTIES.map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => { setFeedbackHerkomst(opt.label); if (!opt.detail) setFeedbackHerkomstDetail('') }}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      feedbackHerkomst === opt.label
                        ? 'bg-[#007AFF] text-white border-[#007AFF]'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >{opt.label}</button>
                ))}
              </div>
              {(() => {
                const selected = HERKOMST_OPTIES.find(o => o.label === feedbackHerkomst)
                return selected?.detail ? (
                  <input
                    type="text"
                    placeholder={selected.placeholder}
                    value={feedbackHerkomstDetail}
                    onChange={e => setFeedbackHerkomstDetail(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all mt-1"
                    autoFocus
                  />
                ) : null
              })()}
            </div>

            {/* Knoppen */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleFeedbackSubmit}
                disabled={!feedbackVragenlijst || !feedbackHerkomst || feedbackSaving}
                className="w-full bg-[#34C759] hover:bg-[#2DB44A] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                {feedbackSaving ? 'Versturen...' : 'Verstuur feedback'}
              </button>
              <button
                onClick={() => setShowFeedback(false)}
                className="w-full text-gray-400 hover:text-gray-600 text-sm py-2 transition-colors"
              >
                Overslaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  if (!directMode && portalView && booking) {
    return <CustomerPortal booking={booking} onFillForm={() => {
      setStep(0)
      setPortalView(false)
    }} />
  }

  const dateStr = booking?.feest_datum
    ? format(parseISO(booking.feest_datum), 'EEEE d MMMM yyyy', { locale: nl })
    : ''

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      {/* Header */}
      <header className="sticky top-0 z-40">
        <div className={`px-4 pb-4 safe-top ${
          isTrouw
            ? 'bg-gradient-to-r from-pink-500 via-rose-400 to-pink-400'
            : 'bg-gradient-to-r from-[#007AFF] via-[#5856D6] to-[#AF52DE]'
        }`}>
          <div className="max-w-2xl mx-auto pt-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-base">
                {isTrouw ? '💍' : '🎉'}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-sm font-bold text-white">
                  {isTrouw ? 'Trouwfeest Vragenlijst' : 'Feest Vragenlijst'}
                </h1>
                <p className="text-xs text-white/70 capitalize">{dateStr}</p>
              </div>
              {/* Autosave indicator */}
              {autoSaveStatus === 'saved' && (
                <div className="flex items-center gap-1.5 bg-white/20 text-white text-xs px-2.5 py-1 rounded-full">
                  <CheckCircle2 size={11} /> Opgeslagen
                </div>
              )}
              {autoSaveStatus === 'restored' && (
                <div className="flex items-center gap-1.5 bg-white/20 text-white text-xs px-2.5 py-1 rounded-full">
                  <CheckCircle2 size={11} /> Gegevens hersteld
                </div>
              )}
            </div>
            {/* Progress bar */}
            <div className="flex gap-1">
              {steps.map((s, i) => (
                <div key={s} className="flex-1 flex flex-col gap-1">
                  <div className={`h-1 rounded-full transition-all duration-300 ${
                    i <= step ? 'bg-white' : 'bg-white/30'
                  }`} />
                  <span className="text-[10px] text-white/60 text-center hidden sm:block">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/60" />
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* Step title */}
        <div className="mb-6">
          <div className="text-xs font-medium text-[#007AFF] uppercase tracking-wider mb-1">
            Stap {step + 1} van {totalSteps}
          </div>
          <h2 className="text-2xl font-black text-gray-900">{steps[step]}</h2>
        </div>

        {/* Step content */}
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5 sm:p-6">
          {step === 0 && <StepContact form={form} setForm={updateForm} isTrouw={isTrouw} />}
          {step === 1 && <StepZaal form={form} setForm={updateForm} />}
          {step === 2 && <StepExtras form={form} setForm={updateForm} isTrouw={isTrouw} />}
          {step === 3 && <StepPlanning form={form} setForm={updateForm} isTrouw={isTrouw} />}
          {step === 4 && <StepMuziek form={form} setForm={updateForm} isTrouw={isTrouw} />}
          {step === 5 && <StepBevestiging form={form} setForm={updateForm} gdprAccepted={gdprAccepted} setGdprAccepted={setGdprAccepted} questionnaireOnly={directMode} />}
        </div>

      </main>

      {/* Navigation footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-200/60 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {step === 0 ? (
            directMode ? (
              <a href={booking?.slug ? `/event/${booking.slug}` : '/'}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-900 px-4 py-3 rounded-xl font-medium transition-colors">
                <ChevronLeft size={18} /> Klantpagina
              </a>
            ) : (
              <button onClick={() => setPortalView(true)}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-900 px-4 py-3 rounded-xl font-medium transition-colors">
                <ChevronLeft size={18} /> Overzicht
              </button>
            )
          ) : (step > 0 && step < totalSteps - 1) ? (
            <button onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-900 px-4 py-3 rounded-xl font-medium transition-colors">
              <ChevronLeft size={18} /> Vorige
            </button>
          ) : null}

          <div className="flex-1" />

          {step < totalSteps - 1 ? (
            <button onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] text-white px-6 py-3 rounded-xl font-semibold transition-colors">
              Volgende <ChevronRight size={18} />
            </button>
          ) : (
            <div className="flex items-center gap-3 w-full">
              <button onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-900 px-4 py-3 rounded-xl font-medium transition-colors">
                <ChevronLeft size={18} /> Vorige
              </button>
              <button onClick={handleSubmit} disabled={saving || !gdprAccepted}
                title={!gdprAccepted ? 'Bevestig eerst bovenstaande verklaring' : ''}
                className="flex-1 flex items-center justify-center gap-2 bg-[#34C759] hover:bg-[#2DB44A] disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl font-semibold transition-colors text-sm">
                {saving ? 'Versturen...' : <><CheckCircle2 size={16} /> {directMode ? 'Vragenlijst indienen' : 'Bevestigen & Documenten Ontvangen'}</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
