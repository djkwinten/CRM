import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Calendar, CheckCircle2, XCircle,
  Clock, Users,
  PartyPopper, Trash2, Copy, RefreshCw, Bell, AlertTriangle, CalendarDays, X, Shield, Download, FileDown, Building2, FileText
} from 'lucide-react'
import { getBookings, createBooking, updateStatus, deleteBooking, initDb, getReminderStatuses, confirmBooking, rejectBooking, restoreBooking, suggestVenues, previewTemplate, sendTemplate, TemplateKey } from '../lib/api'
import { VenueSuggestion } from '../types/venue'
import { Booking } from '../types/booking'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import { BottomTabBar } from '../components/BottomTabBar'

function displayNaam(b: Booking): string {
  if (b.type_feest === 'Trouw' && (b.naam_partner1 || b.naam_partner2)) {
    const v1 = (b.naam_partner1 || '').split(' ')[0]
    const v2 = (b.naam_partner2 || '').split(' ')[0]
    return [v1, v2].filter(Boolean).join(' & ')
  }
  return b.naam_organisator || '—'
}

function StatusBadge({ value, label, updated }: { value: number; label: string; updated?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
      updated
        ? 'bg-amber-50 text-amber-600 border border-amber-300'
        : value
          ? 'bg-green-50 text-green-600 border border-green-200'
          : 'bg-red-50 text-red-500 border border-red-200'
    }`}>
      {updated ? '!' : value ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
      {label}
    </span>
  )
}

const DELETE_CODE = '7777'

function DeleteConfirmModal({ naam, onConfirm, onClose }: { naam: string; onConfirm: () => void; onClose: () => void }) {
  const [code, setCode] = useState('')
  const isValid = code === DELETE_CODE

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-[0_8px_40px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Verwijderen bevestigen</h3>
            <p className="text-xs text-gray-400 mt-0.5">{naam}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Voer de beveiligingscode in om deze boeking definitief te verwijderen.
        </p>
        <input
          type="password"
          placeholder="••••"
          value={code}
          onChange={e => setCode(e.target.value)}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && isValid) onConfirm() }}
          className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-300 rounded-xl px-3 py-2.5 text-sm font-mono tracking-widest text-center focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200 transition-all mb-4"
        />
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors">
            Annuleren
          </button>
          <button onClick={onConfirm} disabled={!isValid}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors">
            Verwijderen
          </button>
        </div>
      </div>
    </div>
  )
}

const AFGEWEZEN_REDENEN = [
  { value: 'prijs', label: '💰 Prijs te hoog' },
  { value: 'datum', label: '📅 Datum niet beschikbaar' },
  { value: 'vibe', label: '🎭 Vibe / stijl match niet' },
  { value: 'collega', label: '🤝 Doorgegeven aan collega' },
  { value: 'klant_haakte_af', label: '👻 Klant haakte af' },
  { value: 'klant_reageert_niet', label: '🔇 Klant reageert niet meer' },
]

function RejectModal({ naam, onConfirm, onClose }: { naam: string; onConfirm: (reden: string) => void; onClose: () => void }) {
  const [selected, setSelected] = useState('')
  const [custom, setCustom] = useState('')

  const finalReden = selected === 'andere' ? custom.trim() : selected

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-[0_8px_40px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <XCircle size={20} className="text-red-500" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Aanvraag afwijzen</h3>
            <p className="text-xs text-gray-400 mt-0.5">{naam}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-3">Kies een reden voor de afwijzing:</p>
        <div className="space-y-2 mb-3">
          {AFGEWEZEN_REDENEN.map(r => (
            <button
              key={r.value}
              type="button"
              onClick={() => setSelected(r.value)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-all ${
                selected === r.value
                  ? 'border-red-400 bg-red-50 text-red-700 font-medium'
                  : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100'
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelected('andere')}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-all ${
              selected === 'andere'
                ? 'border-red-400 bg-red-50 text-red-700 font-medium'
                : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100'
            }`}
          >
            ✏️ Andere reden
          </button>
          {selected === 'andere' && (
            <input
              type="text"
              autoFocus
              placeholder="Typ reden..."
              value={custom}
              onChange={e => setCustom(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-200 transition-all"
            />
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors">
            Annuleren
          </button>
          <button onClick={() => finalReden && onConfirm(finalReden)} disabled={!finalReden}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors">
            Afwijzen
          </button>
        </div>
      </div>
    </div>
  )
}

function MailPreviewModal({ booking, templateKey, onClose, onSent }: { booking: Booking; templateKey: TemplateKey; onClose: () => void; onSent: (key: TemplateKey) => void }) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setLoading(true)
    previewTemplate(templateKey, booking.id).then(p => {
      if (p.error) alert(p.error)
      setSubject(p.subject || '')
      setBody(p.body || '')
      setTo(p.to || booking.email || '')
      setLoading(false)
    })
  }, [booking.id, booking.email, templateKey])

  const send = async () => {
    setSending(true)
    const res = await sendTemplate(templateKey, booking.id, { subject, body })
    setSending(false)
    if (res.success) {
      onSent(templateKey)
      onClose()
      alert(`✅ Mail verstuurd naar ${res.sent_to}`)
    } else {
      alert(`Fout bij versturen: ${res.error}`)
    }
  }

  return <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
    <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-[0_8px_40px_rgba(0,0,0,0.18)] my-auto">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-bold text-gray-900 text-lg">Mail controleren</h3>
          <p className="text-xs text-gray-400 mt-0.5">Naar {to || '—'} · {displayNaam(booking)}</p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400"><X size={16} /></button>
      </div>
      {loading ? <div className="py-10 text-center text-gray-400">Template laden...</div> : <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase text-gray-400">Onderwerp</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF]" />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase text-gray-400">Bericht</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={14} className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF]" />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium">Annuleren</button>
          <button onClick={send} disabled={sending || !subject.trim() || !body.trim()} className="px-4 py-2 rounded-xl bg-[#007AFF] text-white text-sm font-semibold disabled:opacity-50">
            {sending ? 'Versturen...' : 'Verstuur mail'}
          </button>
        </div>
      </div>}
    </div>
  </div>
}

function NewBookingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<{ is_aanvraag: boolean; feest_datum: string; type_feest: 'Trouw' | 'Algemeen'; is_verjaardag: boolean; naam_organisator: string; naam_partner1: string; naam_partner2: string; naam_jarige: string; email: string; telefoon: string; adres_organisator: string; basisprijs: string; locatie_naam: string; locatie_adres: string; venue_id: number | null; speakers_aanwezig: boolean; licht_aanwezig: boolean; dj_booth_aanwezig: boolean; opmerkingen: string }>({ is_aanvraag: true, feest_datum: '', type_feest: 'Algemeen', is_verjaardag: false, naam_organisator: '', naam_partner1: '', naam_partner2: '', naam_jarige: '', email: '', telefoon: '', adres_organisator: '', basisprijs: '', locatie_naam: '', locatie_adres: '', venue_id: null, speakers_aanwezig: false, licht_aanwezig: false, dj_booth_aanwezig: false, opmerkingen: '' })
  const [loading, setLoading] = useState(false)
  const [venueSuggestions, setVenueSuggestions] = useState<VenueSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    let naamOrganisator = form.naam_organisator
    if (form.type_feest === 'Trouw') {
      const v1 = (form.naam_partner1 || '').split(' ')[0]
      const v2 = (form.naam_partner2 || '').split(' ')[0]
      const koppelNaam = [v1, v2].filter(Boolean).join(' & ')
      if (koppelNaam) naamOrganisator = koppelNaam
    }
    const payload: Record<string, unknown> = { feest_datum: form.feest_datum, type_feest: form.type_feest, naam_organisator: naamOrganisator, email: form.email, telefoon: form.telefoon, is_aanvraag: form.is_aanvraag ? 1 : 0 }
    if (form.adres_organisator) payload.adres_organisator = form.adres_organisator
    if (form.basisprijs) payload.basisprijs = parseFloat(form.basisprijs)
    if (form.naam_partner1) payload.naam_partner1 = form.naam_partner1
    if (form.naam_partner2) payload.naam_partner2 = form.naam_partner2
    if (form.naam_jarige) payload.verjaardag_naam_leeftijd = form.naam_jarige
    if (form.locatie_naam) payload.locatie_naam = form.locatie_naam
    if (form.locatie_adres) payload.locatie_adres = form.locatie_adres
    payload.speakers_aanwezig = form.speakers_aanwezig ? 1 : 0
    payload.licht_aanwezig = form.licht_aanwezig ? 1 : 0
    payload.dj_booth_aanwezig = form.dj_booth_aanwezig ? 1 : 0
    if (form.venue_id) payload.venue_id = form.venue_id
    if (form.opmerkingen) payload.opmerkingen = form.opmerkingen
    await createBooking(payload)
    setLoading(false)
    onCreated()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-[0_8px_40px_rgba(0,0,0,0.18),0_2px_8px_rgba(0,0,0,0.10)] my-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Plus size={20} className="text-[#007AFF]" /> Nieuwe Boeking
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Aanvraag / Boeking toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200">
            <button type="button" onClick={() => setForm(p => ({...p, is_aanvraag: true}))}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                form.is_aanvraag
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-50 text-gray-400 hover:text-gray-700'
              }`}>
              📋 Aanvraag
            </button>
            <button type="button" onClick={() => setForm(p => ({...p, is_aanvraag: false}))}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                !form.is_aanvraag
                  ? 'bg-[#007AFF] text-white'
                  : 'bg-gray-50 text-gray-400 hover:text-gray-700'
              }`}>
              ✅ Boeking
            </button>
          </div>
          <p className="text-xs text-gray-400 -mt-1">
            {form.is_aanvraag
              ? 'Aanvraag: nog niet bevestigd, wacht op akkoord klant.'
              : 'Boeking: bevestigd feest met contract/voorschot opvolging.'}
          </p>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Datum *</label>
            <input type="date" required value={form.feest_datum} onChange={e => setForm(p => ({...p, feest_datum: e.target.value}))}
              className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Type Feest *</label>
            <select value={form.type_feest} onChange={e => setForm(p => ({...p, type_feest: e.target.value as 'Trouw' | 'Algemeen'}))}
              className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all">
              <option value="Algemeen">Algemeen Feest</option>
              <option value="Trouw">Trouwfeest</option>
            </select>
          </div>
          {form.type_feest !== 'Trouw' && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Naam Organisator *</label>
              <input type="text" required placeholder="Voornaam Achternaam" value={form.naam_organisator} onChange={e => setForm(p => ({...p, naam_organisator: e.target.value}))}
                className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 placeholder-gray-400 transition-all" />
            </div>
          )}
          {form.type_feest === 'Trouw' && (
            <div className="bg-pink-50 border border-pink-100 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-pink-500 uppercase tracking-wider">💍 Namen Koppel</p>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Partner 1</label>
                <input type="text" placeholder="Voornaam Achternaam" value={form.naam_partner1} onChange={e => setForm(p => ({...p, naam_partner1: e.target.value}))}
                  className="mt-1 w-full bg-white border border-pink-200 text-gray-900 rounded-xl px-3 py-2.5 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-400/20 placeholder-gray-400 transition-all" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Partner 2</label>
                <input type="text" placeholder="Voornaam Achternaam" value={form.naam_partner2} onChange={e => setForm(p => ({...p, naam_partner2: e.target.value}))}
                  className="mt-1 w-full bg-white border border-pink-200 text-gray-900 rounded-xl px-3 py-2.5 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-400/20 placeholder-gray-400 transition-all" />
              </div>
            </div>
          )}
          {form.type_feest === 'Algemeen' && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <button type="button" onClick={() => setForm(p => ({...p, is_verjaardag: !p.is_verjaardag, naam_jarige: ''}))}
                className="flex items-center gap-2 w-full text-left">
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.is_verjaardag ? 'border-amber-500 bg-amber-500' : 'border-amber-300'}`}>
                  {form.is_verjaardag && <span className="text-white text-[10px] font-bold">✓</span>}
                </div>
                <span className="text-xs font-semibold text-amber-700">🎂 Dit is een verjaardagsfeest</span>
              </button>
              {form.is_verjaardag && (
                <div className="mt-3">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Naam + Leeftijd Jarige</label>
                  <input type="text" placeholder="Bijv. Marie — 50 jaar" value={form.naam_jarige} onChange={e => setForm(p => ({...p, naam_jarige: e.target.value}))}
                    className="mt-1 w-full bg-white border border-amber-200 text-gray-900 rounded-xl px-3 py-2.5 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 placeholder-gray-400 transition-all" />
                </div>
              )}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">E-mail</label>
            <input type="email" placeholder="email@voorbeeld.be" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))}
              className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 placeholder-gray-400 transition-all" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Telefoon</label>
            <input type="tel" placeholder="+32 xxx xx xx xx" value={form.telefoon} onChange={e => setForm(p => ({...p, telefoon: e.target.value}))}
              className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 placeholder-gray-400 transition-all" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Adres klant/opdrachtgever</label>
            <input type="text" placeholder="Straat nr, postcode gemeente" value={form.adres_organisator} onChange={e => setForm(p => ({...p, adres_organisator: e.target.value}))}
              className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 placeholder-gray-400 transition-all" />
          </div>
          <div className="relative">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Feestlocatie</label>
            <input
              type="text"
              placeholder="Naam van de zaal of locatie"
              value={form.locatie_naam}
              autoComplete="off"
              onChange={e => {
                const val = e.target.value
                setForm(p => ({ ...p, locatie_naam: val, venue_id: null }))
                if (suggestDebounce.current) clearTimeout(suggestDebounce.current)
                if (val.trim().length >= 2) {
                  suggestDebounce.current = setTimeout(async () => {
                    const results = await suggestVenues(val)
                    setVenueSuggestions(results)
                    setShowSuggestions(results.length > 0)
                  }, 250)
                } else {
                  setVenueSuggestions([])
                  setShowSuggestions(false)
                }
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onFocus={() => { if (venueSuggestions.length > 0) setShowSuggestions(true) }}
              className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 placeholder-gray-400 transition-all"
            />
            {showSuggestions && (
              <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.12)] border border-gray-100 overflow-hidden">
                {venueSuggestions.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onMouseDown={() => {
                      setForm(p => ({ ...p, locatie_naam: v.naam, venue_id: v.id }))
                      setShowSuggestions(false)
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{v.naam}</div>
                      {v.adres && <div className="text-xs text-gray-400 truncate">{v.adres}</div>}
                    </div>
                    {v.booking_count !== undefined && v.booking_count > 0 && (
                      <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                        {v.booking_count}×
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Adres feestlocatie</label>
              <input type="text" placeholder="Straat nr, postcode gemeente" value={form.locatie_adres} onChange={e => setForm(p => ({...p, locatie_adres: e.target.value}))}
                className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 placeholder-gray-400 transition-all" />
            </div>
            {form.venue_id && (
              <p className="text-xs text-teal-600 mt-1 flex items-center gap-1">
                <Building2 size={11} /> Gekoppeld aan bekende zaal
              </p>
            )}
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Technisch voor Contract Info</p>
            {[
              ['speakers_aanwezig', 'Is er geluid/installatie voorzien door de zaal?'],
              ['licht_aanwezig', 'Is er lichtinstallatie voorzien door de zaal?'],
              ['dj_booth_aanwezig', 'Moet DJ Kwinten een DJ booth meenemen?'],
            ].map(([key, label]) => {
              const checked = !!(form as any)[key]
              return <button key={key} type="button" onClick={() => setForm(p => ({ ...p, [key]: !(p as any)[key] }))}
                className={`w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border text-sm font-semibold ${checked ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                <span>{label}</span><span className={`px-2 py-0.5 rounded-full text-xs ${checked ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>{checked ? 'JA' : 'NEE'}</span>
              </button>
            })}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Basisprijs (€)</label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-gray-400 text-sm">€</span>
              <input type="number" min="0" step="0.01" placeholder="0.00" value={form.basisprijs} onChange={e => setForm(p => ({...p, basisprijs: e.target.value}))}
                className="flex-1 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all" />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Richtprijs zonder extra's — kan later worden aangepast</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Notities</label>
            <textarea
              rows={3}
              placeholder="Bijv. contactpersoon zaal, bijzonderheden, hoe klant gevonden..."
              value={form.opmerkingen}
              onChange={e => setForm(p => ({...p, opmerkingen: e.target.value}))}
              className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 placeholder-gray-400 transition-all resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 py-2.5 rounded-xl font-medium transition-colors">
              Annuleren
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#007AFF] hover:bg-[#0066CC] disabled:opacity-50 text-white py-2.5 rounded-xl font-semibold transition-colors">
              {loading ? 'Aanmaken...' : 'Aanmaken'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


function CalendarSubscribeModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const API_ROOT = import.meta.env.VITE_API_URL || ''
  const icsUrl = `${API_ROOT}/api/calendar/bookings.ics`
  const webcalUrl = icsUrl.replace(/^https?:/, 'webcal:')

  const handleCopy = () => {
    navigator.clipboard.writeText(icsUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-[0_8px_40px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#007AFF]/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <CalendarDays size={20} className="text-[#007AFF]" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">iPhone Agenda</h3>
              <p className="text-xs text-gray-400">Boekingen automatisch synchroniseren</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Stap 1 */}
        <div className="space-y-3 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 bg-[#007AFF] rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold mt-0.5">1</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">Tap op de knop hieronder</p>
              <p className="text-xs text-gray-500 mt-0.5">Dit opent rechtstreeks de Agenda-app op je iPhone om te abonneren.</p>
              <a
                href={webcalUrl}
                className="mt-2 flex items-center justify-center gap-2 w-full bg-[#007AFF] hover:bg-[#0066CC] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              >
                <CalendarDays size={16} /> Abonneer via iPhone Agenda
              </a>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3 flex items-start gap-3">
            <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0 text-gray-500 text-xs font-bold mt-0.5">2</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">Werkt niet automatisch?</p>
              <p className="text-xs text-gray-500 mt-0.5">Kopieer de URL en voeg handmatig toe via <span className="font-medium">Agenda → Agenda's → Abonneer op agenda</span>.</p>
              <button
                onClick={handleCopy}
                className={`mt-2 flex items-center justify-center gap-2 w-full border px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  copied
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700'
                }`}
              >
                <Copy size={14} /> {copied ? '✓ Gekopieerd!' : 'Kopieer agenda-URL'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
          <p className="text-xs text-blue-700">
            <span className="font-semibold">Automatisch bijgewerkt:</span> Nieuwe boekingen en aanvragen verschijnen automatisch in je agenda. Aanvragen worden getoond als <span className="italic">tentatieven</span>.
          </p>
        </div>
      </div>
    </div>
  )
}

type ImportApiResult = {
  success: boolean
  imported?: number
  skipped?: number
  total?: number
  errors?: string[]
  error?: string
}

function extractBookingsFromBackupBody(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body
  if (!body || typeof body !== 'object') return null

  const obj = body as Record<string, unknown>
  if (Array.isArray(obj.bookings)) return obj.bookings
  if (Array.isArray(obj.data)) return obj.data
  if (Array.isArray(obj.items)) return obj.items
  if (Array.isArray(obj.records)) return obj.records
  if (Array.isArray(obj.rows)) return obj.rows

  for (const key of ['data', 'backup', 'export', 'payload']) {
    const nested = obj[key]
    if (nested && typeof nested === 'object') {
      const nestedObj = nested as Record<string, unknown>
      if (Array.isArray(nestedObj.bookings)) return nestedObj.bookings
      if (Array.isArray(nestedObj.items)) return nestedObj.items
      if (Array.isArray(nestedObj.records)) return nestedObj.records
      if (Array.isArray(nestedObj.rows)) return nestedObj.rows
    }
  }

  return null
}

function chunkBookingsBySize(bookings: unknown[], maxPayloadBytes = 350_000): unknown[][] {
  const chunks: unknown[][] = []
  let current: unknown[] = []
  let currentSize = 20 // wrapper overhead for {"bookings":[]}

  for (const booking of bookings) {
    const bookingSize = JSON.stringify(booking).length + 2

    if (current.length > 0 && currentSize + bookingSize > maxPayloadBytes) {
      chunks.push(current)
      current = []
      currentSize = 20
    }

    current.push(booking)
    currentSize += bookingSize
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

async function postImportChunk(endpoint: string, bookings: unknown[]): Promise<ImportApiResult> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookings }),
  })

  const responseText = await res.text()
  let result: ImportApiResult
  try {
    result = JSON.parse(responseText) as ImportApiResult
  } catch {
    throw new Error(`Backend gaf geen JSON terug (${res.status}). Endpoint: ${endpoint}. Antwoord: ${responseText.slice(0, 160)}`)
  }

  if (!res.ok || !result.success) {
    throw new Error(result.error || `Import mislukt (${res.status})`)
  }

  return result
}

function BackupModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const API_ROOT = import.meta.env.VITE_API_URL || ''
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportResult(null)
    setImportError(null)

    try {
      const text = await file.text()
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        setImportError('Ongeldig JSON-bestand. Controleer of je het juiste backup-bestand hebt geselecteerd.')
        setImporting(false)
        return
      }

      const endpoint = `${API_ROOT}/api/export/import`

      // In local dev, API_ROOT is intentionally empty and Vite proxies /api to the backend.
      // In a separately deployed static frontend, API_ROOT must point to the backend Worker.
      const isLikelyStaticWorker = !API_ROOT && window.location.hostname.endsWith('.workers.dev')
      if (isLikelyStaticWorker) {
        setImportError('Geen backend-URL ingesteld voor deze deployment. Bouw de frontend opnieuw met VITE_API_URL=<jouw backend Worker URL>.')
        setImporting(false)
        return
      }

      const bookingsToImport = extractBookingsFromBackupBody(json)
      if (!bookingsToImport || bookingsToImport.length === 0) {
        setImportError('Geen boekingen gevonden in het bestand. Ondersteunde formaten: { "bookings": [...] }, een directe array [...], { "data": [...] } of { "data": { "bookings": [...] } }.')
        setImporting(false)
        return
      }

      const chunks = chunkBookingsBySize(bookingsToImport)
      let imported = 0
      let skipped = 0
      const errors: string[] = []

      for (let i = 0; i < chunks.length; i++) {
        const result = await postImportChunk(endpoint, chunks[i])
        imported += result.imported || 0
        skipped += result.skipped || 0
        errors.push(...(result.errors || []))
      }

      setImportResult({ imported, skipped, errors: errors.slice(0, 10) })
      onImported() // herlaad de dashboard-lijst
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Onbekende fout'
      setImportError(`Verbindingsfout — controleer of de backend bereikbaar is. ${message}`)
    }
    setImporting(false)
    // reset file input zodat je hetzelfde bestand opnieuw kan kiezen
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-[0_8px_40px_rgba(0,0,0,0.18)] my-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Shield size={20} className="text-green-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Backup & Herstel</h3>
              <p className="text-xs text-gray-400">Export, import en noodplan</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 mb-4">

          {/* Database export */}
          <div className="border border-gray-200 rounded-xl p-3">
            <p className="text-sm font-semibold text-gray-800 mb-1">📦 Backup downloaden</p>
            <p className="text-xs text-gray-500 mb-3">Download alle boekingen als bestand. Bewaar regelmatig een kopie.</p>
            <div className="flex gap-2">
              <a
                href={`${API_ROOT}/api/export/bookings.json`}
                target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 bg-gray-900 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
              >
                <Download size={13} /> JSON
              </a>
              <a
                href={`${API_ROOT}/api/export/bookings.csv`}
                target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
              >
                <FileDown size={13} /> Excel / CSV
              </a>
            </div>
          </div>

          {/* Import / Herstel */}
          <div className="border border-orange-200 bg-orange-50/50 rounded-xl p-3">
            <p className="text-sm font-semibold text-gray-800 mb-1">♻️ Herstel vanuit backup</p>
            <p className="text-xs text-gray-500 mb-3">
              Selecteer een eerder gedownload <span className="font-medium">.json</span> backup-bestand om alle boekingen te herstellen.
              Bestaande boekingen worden <span className="font-medium">niet overschreven</span> als ze al bestaan.
            </p>

            {/* Resultaat */}
            {importResult && (
              <div className={`mb-3 rounded-lg px-3 py-2 text-xs ${importResult.errors.length > 0 ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
                <p className="font-semibold">✓ Import voltooid</p>
                <p>{importResult.imported} boeking(en) hersteld · {importResult.skipped} overgeslagen</p>
                {importResult.errors.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {importResult.errors.map((e, i) => <li key={i} className="text-amber-700">⚠ {e}</li>)}
                  </ul>
                )}
              </div>
            )}

            {importError && (
              <div className="mb-3 rounded-lg px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-700">
                <p className="font-semibold">Fout bij import</p>
                <p>{importError}</p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              {importing
                ? <><RefreshCw size={14} className="animate-spin" /> Importeren...</>
                : <><Download size={14} className="rotate-180" /> Kies backup-bestand (.json)</>
              }
            </button>
          </div>

          {/* Lege vragenlijst */}
          <div className="border border-gray-200 rounded-xl p-3">
            <p className="text-sm font-semibold text-gray-800 mb-1">📋 Invulbaar Formulier (PDF)</p>
            <p className="text-xs text-gray-500 mb-3">Digitaal invulbaar op iPad, iPhone of computer. Bevat alle velden en checkboxes.</p>
            <div className="flex gap-2">
              <a
                href="/djkwinten-vragenlijst-trouw.pdf"
                download
                className="flex-1 flex items-center justify-center gap-1.5 bg-pink-500 hover:bg-pink-600 text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
              >
                💍 Trouw
              </a>
              <a
                href="/djkwinten-vragenlijst-algemeen.pdf"
                download
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#007AFF] hover:bg-[#0066CC] text-white px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
              >
                🎉 Algemeen
              </a>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
          <p className="text-xs text-amber-700">
            <span className="font-semibold">Tip:</span> Download de JSON-backup maandelijks en bewaar in iCloud/Google Drive. Bij verlies van de app herstel je alles via "Herstel vanuit backup".
          </p>
        </div>
      </div>
    </div>
  )
}

const CACHE_KEY = 'dj-dashboard-bookings'
const CACHE_TTL = 5 * 60 * 1000 // 5 minuten

function readCache(): Booking[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw) as { data: Booking[]; ts: number }
    if (Date.now() - ts > CACHE_TTL) return null
    return data
  } catch { return null }
}

function writeCache(data: Booking[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

export function Dashboard() {
  const cached = readCache()
  const [bookings, setBookings] = useState<Booking[]>(cached ?? [])
  const [loading, setLoading] = useState(cached === null) // toon spinner enkel als er niks in cache zit
  const [refreshing, setRefreshing] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [search, setSearch] = useState('')
  const [pendingReminders, setPendingReminders] = useState(0)
  const [activeFilter, setActiveFilter] = useState<'all' | 'aanvragen' | 'boekingen' | 'afgelopen' | 'afgewezen'>('all')
  const [deleteToConfirm, setDeleteToConfirm] = useState<Booking | null>(null)
  const [showCalendarModal, setShowCalendarModal] = useState(false)
  const [showBackupModal, setShowBackupModal] = useState(false)
  const [reminderSending] = useState<number | null>(null) // bookingId dat bezig is
  const [reviewSending] = useState<number | null>(null)
  const [feestHerinneringSending] = useState<number | null>(null)
  const [rejectToConfirm, setRejectToConfirm] = useState<Booking | null>(null)
  const [mailToSend, setMailToSend] = useState<{ booking: Booking; key: TemplateKey } | null>(null)
  const navigate = useNavigate()

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const data = await getBookings()
      setBookings(data)
      writeCache(data)
      getReminderStatuses().then(rs => {
        setPendingReminders(rs.filter(r => r.needs_reminder).length)
      }).catch(() => {})
      // Migrations op de achtergrond, nooit blokkerend
      initDb().catch(() => {})
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    // Als we cache hebben: toon die direct, laad stil op achtergrond
    load(cached !== null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleStatus = async (b: Booking, field: 'status_contract' | 'status_voorschot') => {
    const newVal = b[field] ? 0 : 1
    await updateStatus(b.id, { [field]: newVal })
    setBookings(prev => {
      const updated = prev.map(x => x.id === b.id ? { ...x, [field]: newVal } : x)
      writeCache(updated)
      return updated
    })
  }

  const handleDelete = (b: Booking) => {
    setDeleteToConfirm(b)
  }

  const handleDeleteConfirmed = async () => {
    if (!deleteToConfirm) return
    await deleteBooking(deleteToConfirm.id)
    setBookings(prev => prev.filter(x => x.id !== deleteToConfirm.id))
    setDeleteToConfirm(null)
  }

  const handleConfirm = async (b: Booking) => {
    if (!confirm(`Aanvraag van ${displayNaam(b)} bevestigen als boeking?`)) return
    await confirmBooking(b.id)
    setBookings(prev => {
      const updated = prev.map(x => x.id === b.id ? { ...x, is_aanvraag: 0 } : x)
      writeCache(updated)
      return updated
    })
  }

  const handleRejectConfirmed = async (reden: string) => {
    if (!rejectToConfirm) return
    await rejectBooking(rejectToConfirm.id, reden)
    setBookings(prev => {
      const updated = prev.map(x => x.id === rejectToConfirm.id ? { ...x, is_afgewezen: 1, afgewezen_reden: reden } : x)
      writeCache(updated)
      return updated
    })
    setRejectToConfirm(null)
  }

  const handleRestore = async (b: Booking) => {
    await restoreBooking(b.id)
    setBookings(prev => {
      const updated = prev.map(x => x.id === b.id ? { ...x, is_afgewezen: 0, afgewezen_reden: '' } : x)
      writeCache(updated)
      return updated
    })
  }

  const openMailTemplate = (b: Booking, key: TemplateKey) => {
    if (!b.email) { alert('Geen e-mailadres bekend voor deze boeking.'); return }
    setMailToSend({ booking: b, key })
  }

  const handleTemplateSent = (key: TemplateKey) => {
    if (!mailToSend) return
    const id = mailToSend.booking.id
    const now = new Date().toISOString()
    setBookings(prev => {
      const updated = prev.map(x => {
        if (x.id !== id) return x
        if (key === 'aanvraag_followup') return { ...x, aanvraag_reminder_sent_at: now }
        if (key === 'review_request') return { ...x, review_sent_at: now }
        if (key === 'feest_nadert') return { ...x, feest_herinnering_sent_at: now }
        if (key === 'vragenlijst_reminder') return { ...x, reminder_sent_at: now } as Booking
        return x
      })
      writeCache(updated)
      return updated
    })
  }

  const handleCardClick = (e: React.MouseEvent, bookingId: number) => {
    const target = e.target as HTMLElement
    if (target.closest('button,a,input,textarea,select')) return
    navigate(`/boeking/${bookingId}`)
  }

  const copyFormLink = (b: Booking) => {
    const path = b.slug ? `/vragenlijst/${b.slug}` : `/formulier/${b.id}`
    const url = `${window.location.origin}${path}`
    navigator.clipboard.writeText(url)
    alert(`Formulier-link gekopieerd!\n\nStuur deze link naar je klant:\n${url}`)
  }

  const today = new Date().toISOString().slice(0, 10)
  const afgewezen = bookings.filter(b => b.is_afgewezen)
  const actief = bookings.filter(b => !b.is_afgewezen)
  const bevestigd = actief.filter(b => !b.is_aanvraag)
  const aanvragen = actief.filter(b => b.is_aanvraag)
  const komend = bevestigd.filter(b => !b.feest_datum || b.feest_datum >= today)
  const afgelopen = bevestigd.filter(b => b.feest_datum && b.feest_datum < today)

  const filterFn = (b: Booking) =>
    displayNaam(b).toLowerCase().includes(search.toLowerCase()) ||
    b.naam_organisator?.toLowerCase().includes(search.toLowerCase()) ||
    b.locatie_naam?.toLowerCase().includes(search.toLowerCase()) ||
    b.feest_datum?.includes(search)

  const filteredBoekingen = (activeFilter === 'afgelopen' ? afgelopen : komend).filter(filterFn)
  const filteredAanvragen = aanvragen.filter(filterFn)
  const filteredAfgewezen = afgewezen.filter(filterFn)

  const stats = {
    aanvragen: aanvragen.length,
    total: komend.length,
    afgelopen: afgelopen.length,
    afgewezen: afgewezen.length,
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      {/* Header with gradient */}
      <header className="sticky top-0 z-40">
        {/* Gradient band */}
        <div className="bg-gradient-to-r from-[#007AFF] via-[#5856D6] to-[#AF52DE] px-4 sm:px-6 pb-4 safe-top">
          <div className="max-w-7xl mx-auto flex items-center justify-between pt-4">
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">DJ Manager</h1>
              <p className="text-xs text-white/60">Boekingsbeheer</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowBackupModal(true)}
                className="p-2 hover:bg-white/15 rounded-xl text-white/70 hover:text-white transition-colors" title="Backup & Noodplan">
                <Shield size={18} />
              </button>
              <button onClick={() => setShowCalendarModal(true)}
                className="p-2 hover:bg-white/15 rounded-xl text-white/70 hover:text-white transition-colors" title="Agenda synchroniseren">
                <CalendarDays size={18} />
              </button>
              <button onClick={() => navigate('/zalen')}
                className="p-2 hover:bg-white/15 rounded-xl text-white/70 hover:text-white transition-colors" title="Zalen">
                <Building2 size={18} />
              </button>
              <button onClick={() => navigate('/templates')}
                className="p-2 hover:bg-white/15 rounded-xl text-white/70 hover:text-white transition-colors" title="Templates">
                <FileText size={18} />
              </button>
              <button onClick={() => navigate('/herinneringen')}
                className="p-2 hover:bg-white/15 rounded-xl text-white/70 hover:text-white transition-colors relative" title="Herinneringen">
                <Bell size={18} />
                {pendingReminders > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-orange-400 rounded-full" />
                )}
              </button>
            </div>
          </div>
        </div>
        {/* White nav bar below gradient */}
        <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/60" />
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-6 space-y-6">
        {/* Stats — klikbaar om te filteren */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Aanvragen', value: stats.aanvragen, icon: <Clock size={18} />, color: 'text-amber-500 bg-amber-50', filter: 'aanvragen' as const },
            { label: 'Komend', value: stats.total, icon: <Calendar size={18} />, color: 'text-[#007AFF] bg-[#007AFF]/10', filter: 'boekingen' as const },
            { label: 'Afgelopen', value: stats.afgelopen, icon: <CheckCircle2 size={18} />, color: 'text-gray-400 bg-gray-100', filter: 'afgelopen' as const },
            { label: 'Afgewezen', value: stats.afgewezen, icon: <XCircle size={18} />, color: 'text-red-400 bg-red-50', filter: 'afgewezen' as const },
          ].map(s => (
            <div key={s.label}
              onClick={() => setActiveFilter(activeFilter === s.filter ? 'all' : s.filter)}
              className={`bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.06)] p-4 transition-all cursor-pointer hover:shadow-[0_6px_24px_rgba(0,0,0,0.14),0_2px_6px_rgba(0,0,0,0.08)] ${
                activeFilter === s.filter ? 'ring-2 ring-[#007AFF]/40' : ''
              }`}>
              <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center mb-3`}>{s.icon}</div>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                {s.label}
                {activeFilter === s.filter && <span className="text-[#007AFF] font-medium">✓</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => load(false)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-700 transition-colors" title="Verversen">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <input type="text" placeholder="Zoeken..." value={search} onChange={e => setSearch(e.target.value)}
              className="bg-white border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 w-full sm:w-48 transition-all shadow-sm" />
            <button onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap shadow-sm">
              <Plus size={16} /> Nieuwe Boeking
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 animate-pulse">Boekingen laden...</div>
        ) : (
          <div className="space-y-6">

            {/* ── Aanvragen ── */}
            {(filteredAanvragen.length > 0 || aanvragen.length > 0) && activeFilter !== 'boekingen' && activeFilter !== 'afgelopen' && activeFilter !== 'afgewezen' && (
              <div className="space-y-3">
                <h2 className="font-semibold text-amber-600 text-sm uppercase tracking-wider flex items-center gap-2">
                  <Clock size={14} /> Aanvragen ({filteredAanvragen.length})
                </h2>
                {filteredAanvragen.length === 0 ? (
                  <p className="text-sm text-gray-400 pl-1">Geen aanvragen gevonden.</p>
                ) : filteredAanvragen.map(b => (
                  <div key={b.id}
                    onClick={(e) => handleCardClick(e, b.id)}
                    title="Klik om details te openen"
                    className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-4 border-l-4 border-amber-400 hover:shadow-[0_2px_8px_rgba(0,0,0,0.10),0_8px_24px_rgba(0,0,0,0.06)] transition-all cursor-pointer">
                    {/* Bovenste rij: icoon + info + verwijder */}
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${
                        b.type_feest === 'Trouw' ? 'bg-pink-50' : 'bg-amber-50'
                      }`}>
                        {b.type_feest === 'Trouw' ? '💍' : '📋'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 text-sm leading-tight">{displayNaam(b)}</h3>
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 whitespace-nowrap">
                            <Clock size={10} /> Aanvraag
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                          <Calendar size={11} />
                          <span>{b.feest_datum ? format(parseISO(b.feest_datum), 'd MMM yyyy', { locale: nl }) : '—'}</span>
                          {b.locatie_naam && <><span className="text-gray-300">·</span><span className="truncate text-gray-400">{b.locatie_naam}</span></>}
                        </div>
                        {b.created_at && (
                          <div className="mt-0.5 text-xs text-gray-400">
                            Ontvangen: {format(new Date(b.created_at), 'd MMM yyyy HH:mm', { locale: nl })}
                          </div>
                        )}
                      </div>
                      <button onClick={() => handleDelete(b)} title="Verwijderen"
                        className="p-1.5 hover:bg-red-50 rounded-xl text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {/* Onderste rij: knoppen naast elkaar op volle breedte */}
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {(() => {
                        const daysSince = b.created_at
                          ? Math.round((Date.now() - new Date(b.created_at).getTime()) / 86400000)
                          : 0
                        const isUrgent = daysSince >= 14
                        if (!b.email) {
                          // Geen e-mail: toon enkel dagen-teller, geen klikbare knop
                          return (
                            <span className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium ${
                              isUrgent ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-400'
                            }`} title="Geen e-mailadres — herinnering niet mogelijk">
                              {isUrgent ? `⚠️ ${daysSince}d` : `${daysSince}d`}
                            </span>
                          )
                        }
                        return (
                          <button
                            onClick={() => openMailTemplate(b, 'aanvraag_followup')}
                            disabled={reminderSending === b.id}
                            title={b.aanvraag_reminder_sent_at
                              ? `Herinnering verstuurd op ${new Date(b.aanvraag_reminder_sent_at).toLocaleDateString('nl-BE')}`
                              : `${daysSince} dag${daysSince !== 1 ? 'en' : ''} geleden aangevraagd`}
                            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                              b.aanvraag_reminder_sent_at
                                ? 'bg-green-50 text-green-600 border border-green-200 hover:bg-green-100'
                                : isUrgent
                                  ? 'bg-orange-500 text-white hover:bg-orange-600 font-semibold shadow-sm'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                            }`}>
                            {reminderSending === b.id
                              ? '...'
                              : b.aanvraag_reminder_sent_at
                                ? '✅ Verstuurd'
                                : isUrgent
                                  ? `📩 ${daysSince}d — Herinnering!`
                                  : `📩 ${daysSince}d`}
                          </button>
                        )
                      })()}
                      <button onClick={() => handleConfirm(b)}
                        className="flex items-center justify-center gap-1 bg-[#007AFF] hover:bg-[#0066CC] text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap">
                        Bevestig ✓
                      </button>
                      <button onClick={() => setRejectToConfirm(b)}
                        className="flex items-center justify-center gap-1 bg-red-50 hover:bg-red-100 text-red-500 border border-red-200 px-3 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap">
                        <XCircle size={14} /> Afwijzen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Boekingen / Afgelopen ── */}
            {activeFilter !== 'aanvragen' && activeFilter !== 'afgewezen' && <div className="space-y-3">
              <h2 className="font-semibold text-gray-500 text-sm uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 size={14} />
                {activeFilter === 'afgelopen' ? `Afgelopen feesten (${filteredBoekingen.length})` : `Komende boekingen (${filteredBoekingen.length})`}
              </h2>
              {filteredBoekingen.length === 0 ? (
                <div className="text-center py-12">
                  <PartyPopper size={48} className="mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-400">{activeFilter === 'afgelopen' ? 'Geen afgelopen feesten gevonden.' : 'Nog geen komende boekingen.'}</p>
                </div>
              ) : (
                filteredBoekingen.map(b => (
                  <div key={b.id}
                    onClick={(e) => handleCardClick(e, b.id)}
                    title="Klik om details te openen"
                    className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-4 hover:shadow-[0_2px_8px_rgba(0,0,0,0.10),0_8px_24px_rgba(0,0,0,0.06)] transition-all cursor-pointer">
                    {/* Bovenste rij: icoon + info + icoontjes */}
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${
                        b.type_feest === 'Trouw' ? 'bg-pink-50' : 'bg-[#007AFF]/08'
                      }`}>
                        {b.type_feest === 'Trouw' ? '💍' : '🎉'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 text-sm leading-tight">{displayNaam(b)}</h3>
                          <span className="text-xs text-gray-400">{b.type_feest}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500 flex-wrap">
                          <Calendar size={11} />
                          <span>{b.feest_datum ? format(parseISO(b.feest_datum), 'd MMM yyyy', { locale: nl }) : '—'}</span>
                          {b.feest_datum && (() => {
                            const days = Math.ceil((new Date(b.feest_datum).getTime() - Date.now()) / 86400000)
                            if (days < 0) return null
                            const cls = days <= 14
                              ? 'bg-red-100 text-red-600 font-semibold'
                              : days <= 30
                                ? 'bg-orange-100 text-orange-500 font-medium'
                                : 'bg-gray-100 text-gray-400'
                            return (
                              <span className={`px-1.5 py-0.5 rounded-md text-[11px] ${cls}`}>
                                {days === 0 ? 'Vandaag!' : `${days}d`}
                              </span>
                            )
                          })()}
                          {b.locatie_naam && <><span className="text-gray-300">·</span><span className="truncate text-gray-400">{b.locatie_naam}</span></>}
                          {b.aantal_gasten && <><span className="text-gray-300">·</span><span className="flex items-center gap-0.5 text-gray-400"><Users size={11} /> {b.aantal_gasten}</span></>}
                          {b.einduur && <><span className="text-gray-300">·</span><span className="flex items-center gap-0.5 text-gray-400"><Clock size={11} /> {b.einduur}</span></>}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button onClick={() => copyFormLink(b)} title="Kopieer formulier-link"
                          className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-700 transition-colors">
                          <Copy size={14} />
                        </button>
                        <button onClick={() => handleDelete(b)} title="Verwijderen"
                          className="p-1.5 hover:bg-red-50 rounded-xl text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {/* Onderste rij: status pills + knoppen */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <div className="flex gap-1.5 flex-1 flex-wrap">
                        <button onClick={() => handleToggleStatus(b, 'status_contract')} title="Klik om te wisselen">
                          <StatusBadge value={b.status_contract} label="Contract" />
                        </button>
                        <button onClick={() => handleToggleStatus(b, 'status_voorschot')} title="Klik om te wisselen">
                          <StatusBadge value={b.status_voorschot} label="Voorschot" />
                        </button>
                        <a href={b.slug ? `/vragenlijst/${b.slug}` : `/formulier/${b.id}`} target="_blank" rel="noopener noreferrer" title="Open vragenlijst">
                          <StatusBadge value={b.status_vragenlijst} label="Vragenlijst" updated={!!b.vragenlijst_updated_at && !!b.vragenlijst_first_submitted_at} />
                        </a>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Feest nadert knop — alleen zichtbaar vóór feestdatum */}
                        {b.feest_datum && new Date(b.feest_datum) >= new Date() && b.email && (
                          <button
                            onClick={() => openMailTemplate(b, 'feest_nadert')}
                            disabled={feestHerinneringSending === b.id}
                            title={b.feest_herinnering_sent_at
                              ? `"Feest nadert"-mail verstuurd op ${new Date(b.feest_herinnering_sent_at).toLocaleDateString('nl-BE')}`
                              : 'Stuur "feest nadert"-herinnering'}
                            className={`flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                              b.feest_herinnering_sent_at
                                ? 'bg-sky-50 text-sky-600 border border-sky-200 hover:bg-sky-100'
                                : 'bg-sky-500 hover:bg-sky-600 text-white font-semibold shadow-sm'
                            }`}>
                            {feestHerinneringSending === b.id ? '...' : b.feest_herinnering_sent_at ? '📅 Verstuurd' : '📅 Feest nadert'}
                          </button>
                        )}
                        {/* Review knop — alleen zichtbaar na feestdatum */}
                        {b.feest_datum && new Date(b.feest_datum) < new Date() && b.email && (
                          <button
                            onClick={() => openMailTemplate(b, 'review_request')}
                            disabled={reviewSending === b.id}
                            title={b.review_sent_at
                              ? `Review-verzoek verstuurd op ${new Date(b.review_sent_at).toLocaleDateString('nl-BE')}`
                              : 'Stuur review-verzoek'}
                            className={`flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                              b.review_sent_at
                                ? 'bg-purple-50 text-purple-600 border border-purple-200 hover:bg-purple-100'
                                : 'bg-purple-500 hover:bg-purple-600 text-white font-semibold shadow-sm'
                            }`}>
                            {reviewSending === b.id ? '...' : b.review_sent_at ? '⭐ Verstuurd' : '⭐ Review'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>}

            {/* ── Afgewezen ── */}
            {(activeFilter === 'afgewezen' || activeFilter === 'all') && filteredAfgewezen.length > 0 && (
              <div className="space-y-3">
                <h2 className="font-semibold text-red-400 text-sm uppercase tracking-wider flex items-center gap-2">
                  <XCircle size={14} /> Afgewezen ({filteredAfgewezen.length})
                </h2>
                {filteredAfgewezen.map(b => {
                  const redenLabel = AFGEWEZEN_REDENEN.find(r => r.value === b.afgewezen_reden)?.label || b.afgewezen_reden || '—'
                  return (
                    <div key={b.id}
                      onClick={(e) => handleCardClick(e, b.id)}
                      title="Klik om details te openen"
                      className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-4 border-l-4 border-red-300 opacity-75 hover:opacity-100 transition-all cursor-pointer">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${
                          b.type_feest === 'Trouw' ? 'bg-pink-50' : 'bg-red-50'
                        }`}>
                          {b.type_feest === 'Trouw' ? '💍' : '📋'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-gray-500 text-sm leading-tight line-through">{displayNaam(b)}</h3>
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-400 border border-red-200 whitespace-nowrap">
                              <XCircle size={10} /> Afgewezen
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
                            <Calendar size={11} />
                            <span>{b.feest_datum ? format(parseISO(b.feest_datum), 'd MMM yyyy', { locale: nl }) : '—'}</span>
                            {b.locatie_naam && <><span className="text-gray-200">·</span><span className="truncate">{b.locatie_naam}</span></>}
                          </div>
                          {b.afgewezen_reden && (
                            <div className="mt-1.5">
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-400 border border-red-100">
                                {redenLabel}
                              </span>
                            </div>
                          )}
                        </div>
                        <button onClick={() => handleDelete(b)} title="Verwijderen"
                          className="p-1.5 hover:bg-red-50 rounded-xl text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => handleRestore(b)}
                          className="flex items-center justify-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 px-3 py-2 rounded-xl text-sm font-medium transition-colors">
                          ↩ Terugzetten als aanvraag
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        )}
      </main>

      <BottomTabBar />

      {showNewModal && (
        <NewBookingModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => { localStorage.removeItem(CACHE_KEY); load(false) }}
        />
      )}
      {deleteToConfirm && (
        <DeleteConfirmModal
          naam={`${deleteToConfirm.is_aanvraag ? 'Aanvraag' : 'Boeking'} van ${displayNaam(deleteToConfirm)}`}
          onConfirm={handleDeleteConfirmed}
          onClose={() => setDeleteToConfirm(null)}
        />
      )}
      {rejectToConfirm && (
        <RejectModal
          naam={displayNaam(rejectToConfirm)}
          onConfirm={handleRejectConfirmed}
          onClose={() => setRejectToConfirm(null)}
        />
      )}
      {mailToSend && (
        <MailPreviewModal
          booking={mailToSend.booking}
          templateKey={mailToSend.key}
          onClose={() => setMailToSend(null)}
          onSent={handleTemplateSent}
        />
      )}
      {showCalendarModal && (
        <CalendarSubscribeModal onClose={() => setShowCalendarModal(false)} />
      )}
      {showBackupModal && (
        <BackupModal
          onClose={() => setShowBackupModal(false)}
          onImported={() => { localStorage.removeItem(CACHE_KEY); load(false) }}
        />
      )}
    </div>
  )
}
