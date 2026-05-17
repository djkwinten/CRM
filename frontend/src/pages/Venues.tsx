import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, RefreshCw, Building2, MapPin, Users, Phone, Mic,
  Volume2, VolumeX, Speaker, Lightbulb, Music2, Wifi,
  Car, ChevronRight, Trash2, X, Upload, Edit2, Download, Calendar,
  AlertTriangle, Globe, Mail
} from 'lucide-react'
import {
  getVenues, getVenueBookings, createVenue, updateVenue, deleteVenue,
  populateVenuesFromBookings
} from '../lib/api'
import { Venue, VenueBooking } from '../types/venue'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import { BottomTabBar } from '../components/BottomTabBar'

const API_ROOT = import.meta.env.VITE_API_URL || ''

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayNaamVenue(b: VenueBooking): string {
  if (b.type_feest === 'Trouw' && (b.naam_partner1 || b.naam_partner2)) {
    const v1 = (b.naam_partner1 || '').split(' ')[0]
    const v2 = (b.naam_partner2 || '').split(' ')[0]
    return [v1, v2].filter(Boolean).join(' & ')
  }
  return b.naam_organisator || '—'
}

function parseFotos(fotosJson?: string | null): string[] {
  if (!fotosJson) return []
  try { return JSON.parse(fotosJson) } catch { return [] }
}

function rijtijdLabel(venue: Venue): string | null {
  if (!venue.afstand_km && !venue.rijtijd_min) return null
  const parts: string[] = []
  if (venue.afstand_km) parts.push(`${venue.afstand_km} km`)
  if (venue.rijtijd_min) parts.push(`${venue.rijtijd_min} min`)
  return parts.join(' · ')
}

// ── EquipmentPill ─────────────────────────────────────────────────────────────

function EquipPill({ icon, label, active }: { icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
      active
        ? 'bg-green-50 text-green-700 border-green-200'
        : 'bg-gray-50 text-gray-300 border-gray-100'
    }`}>
      {icon}
      {label}
    </span>
  )
}

// ── VenueCard ─────────────────────────────────────────────────────────────────

function VenueCard({ venue, onClick }: { venue: Venue; onClick: () => void }) {
  const fotos = parseFotos(venue.fotos)
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-4 hover:shadow-[0_2px_8px_rgba(0,0,0,0.10),0_8px_24px_rgba(0,0,0,0.06)] transition-all cursor-pointer"
    >
      <div className="flex items-start gap-3">
        {/* Foto of icoon */}
        <div className="flex-shrink-0">
          {fotos.length > 0 ? (
            <img
              src={`${API_ROOT}/api/uploads/${fotos[0]}`}
              alt={venue.naam}
              className="w-14 h-14 rounded-xl object-cover bg-gray-100"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-teal-50 flex items-center justify-center">
              <Building2 size={24} className="text-teal-500" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900 text-sm leading-tight">{venue.naam}</h3>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {(venue.booking_count ?? 0) > 0 && (
                <span className="text-xs bg-[#007AFF]/10 text-[#007AFF] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                  {venue.booking_count} bkn
                </span>
              )}
              <ChevronRight size={14} className="text-gray-300" />
            </div>
          </div>

          {venue.adres && (
            <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
              <MapPin size={11} />
              <span className="truncate">{venue.adres}</span>
            </div>
          )}
          {rijtijdLabel(venue) && (
            <div className="flex items-center gap-1 mt-0.5 text-xs text-teal-600 font-medium">
              <Car size={11} />
              <span>{rijtijdLabel(venue)}</span>
            </div>
          )}
          {venue.capaciteit && (
            <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
              <Users size={11} />
              <span>Max. {venue.capaciteit} personen</span>
            </div>
          )}

          {/* Apparatuur pills */}
          <div className="flex flex-wrap gap-1 mt-2">
            <EquipPill icon={<Speaker size={9} />} label="Speakers" active={!!venue.speakers_aanwezig} />
            <EquipPill icon={<Lightbulb size={9} />} label="Licht" active={!!venue.licht_aanwezig} />
            <EquipPill icon={<Mic size={9} />} label="Micro" active={!!venue.micro_aanwezig} />
            <EquipPill icon={<Music2 size={9} />} label="DJ Booth" active={!!venue.dj_booth_aanwezig} />
            {venue.geluidsbeperking ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border bg-red-50 text-red-600 border-red-200">
                <VolumeX size={9} />
                {venue.geluidsbeperking_db ? `${venue.geluidsbeperking_db} dB` : 'Begrenzer'}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── VenueFormModal ─────────────────────────────────────────────────────────────

interface VenueFormState {
  naam: string
  adres: string
  capaciteit: string
  contact_naam: string
  contact_telefoon: string
  contact_email: string
  website: string
  geluidsbeperking: boolean
  geluidsbeperking_db: string
  speakers_aanwezig: boolean
  licht_aanwezig: boolean
  micro_aanwezig: boolean
  dj_booth_aanwezig: boolean
  uplights_aanwezig: boolean
  speakers_buiten: boolean
  parkeren_info: string
  gelijkvloers: boolean
  wifi_code: string
  notities: string
  fotos: string[]
  afstand_km: string
  rijtijd_min: string
}

function emptyForm(): VenueFormState {
  return {
    naam: '', adres: '', capaciteit: '',
    contact_naam: '', contact_telefoon: '', contact_email: '', website: '',
    geluidsbeperking: false, geluidsbeperking_db: '',
    speakers_aanwezig: false, licht_aanwezig: false, micro_aanwezig: false,
    dj_booth_aanwezig: false, uplights_aanwezig: false, speakers_buiten: false,
    parkeren_info: '', gelijkvloers: true, wifi_code: '', notities: '',
    fotos: [], afstand_km: '', rijtijd_min: ''
  }
}

function venueToForm(v: Venue): VenueFormState {
  return {
    naam: v.naam || '',
    adres: v.adres || '',
    capaciteit: v.capaciteit ? String(v.capaciteit) : '',
    contact_naam: v.contact_naam || '',
    contact_telefoon: v.contact_telefoon || '',
    contact_email: v.contact_email || '',
    website: v.website || '',
    geluidsbeperking: !!v.geluidsbeperking,
    geluidsbeperking_db: v.geluidsbeperking_db ? String(v.geluidsbeperking_db) : '',
    speakers_aanwezig: !!v.speakers_aanwezig,
    licht_aanwezig: !!v.licht_aanwezig,
    micro_aanwezig: !!v.micro_aanwezig,
    dj_booth_aanwezig: !!v.dj_booth_aanwezig,
    uplights_aanwezig: !!v.uplights_aanwezig,
    speakers_buiten: !!v.speakers_buiten,
    parkeren_info: v.parkeren_info || '',
    gelijkvloers: v.gelijkvloers !== 0,
    wifi_code: v.wifi_code || '',
    notities: v.notities || '',
    fotos: parseFotos(v.fotos),
    afstand_km: v.afstand_km != null ? String(v.afstand_km) : '',
    rijtijd_min: v.rijtijd_min != null ? String(v.rijtijd_min) : '',
  }
}

function VenueFormModal({
  venue,
  onClose,
  onSaved
}: {
  venue: Venue | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<VenueFormState>(venue ? venueToForm(venue) : emptyForm())
  const [loading, setLoading] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof VenueFormState>(key: K, val: VenueFormState[K]) =>
    setForm(p => ({ ...p, [key]: val }))

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API_ROOT}/api/uploads`, { method: 'POST', body: fd })
      const data = await res.json() as { key: string }
      if (data.key) setForm(p => ({ ...p, fotos: [...p.fotos, data.key] }))
    } catch { /* ignore */ }
    setUploadingPhoto(false)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  const removePhoto = (idx: number) =>
    setForm(p => ({ ...p, fotos: p.fotos.filter((_, i) => i !== idx) }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.naam.trim()) return
    setLoading(true)
    const payload: Partial<Venue> = {
      naam: form.naam.trim(),
      adres: form.adres || undefined,
      capaciteit: form.capaciteit ? parseInt(form.capaciteit) : undefined,
      contact_naam: form.contact_naam || undefined,
      contact_telefoon: form.contact_telefoon || undefined,
      contact_email: form.contact_email || undefined,
      website: form.website || undefined,
      geluidsbeperking: form.geluidsbeperking ? 1 : 0,
      geluidsbeperking_db: form.geluidsbeperking && form.geluidsbeperking_db ? parseInt(form.geluidsbeperking_db) : undefined,
      speakers_aanwezig: form.speakers_aanwezig ? 1 : 0,
      licht_aanwezig: form.licht_aanwezig ? 1 : 0,
      micro_aanwezig: form.micro_aanwezig ? 1 : 0,
      dj_booth_aanwezig: form.dj_booth_aanwezig ? 1 : 0,
      uplights_aanwezig: form.uplights_aanwezig ? 1 : 0,
      speakers_buiten: form.speakers_buiten ? 1 : 0,
      parkeren_info: form.parkeren_info || undefined,
      gelijkvloers: form.gelijkvloers ? 1 : 0,
      wifi_code: form.wifi_code || undefined,
      fotos: form.fotos.length > 0 ? JSON.stringify(form.fotos) : undefined,
      notities: form.notities || undefined,
      afstand_km: form.afstand_km ? parseFloat(form.afstand_km) : null,
      rijtijd_min: form.rijtijd_min ? parseInt(form.rijtijd_min) : null,
    }
    try {
      if (venue) {
        await updateVenue(venue.id, payload)
      } else {
        await createVenue(payload)
      }
      onSaved()
      onClose()
    } catch { /* ignore */ }
    setLoading(false)
  }

  const inputCls = "w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 placeholder-gray-400 transition-all"
  const labelCls = "text-xs font-medium text-gray-500 uppercase tracking-wider"

  const ToggleBtn = ({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-colors ${
        active ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-400 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  )

  const CheckToggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 w-full text-left py-1"
    >
      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
        checked ? 'bg-teal-500 border-teal-500' : 'border-gray-300'
      }`}>
        {checked && <span className="text-white text-[10px] font-bold">✓</span>}
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-[0_8px_40px_rgba(0,0,0,0.18)] my-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={18} className="text-teal-500" />
            {venue ? 'Zaal bewerken' : 'Nieuwe Zaal'}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Basisinfo */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Basisinfo</p>
            <div>
              <label className={labelCls}>Naam *</label>
              <input required type="text" placeholder="Feestzaal De Kroon" value={form.naam}
                onChange={e => set('naam', e.target.value)} className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className={labelCls}>Adres</label>
              <input type="text" placeholder="Stationsstraat 12, 9000 Gent" value={form.adres}
                onChange={e => set('adres', e.target.value)} className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className={labelCls}>Max. capaciteit (personen)</label>
              <input type="number" min="1" placeholder="200" value={form.capaciteit}
                onChange={e => set('capaciteit', e.target.value)} className={`mt-1 ${inputCls}`} />
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-3 pt-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Contactpersoon zaal</p>
            <div>
              <label className={labelCls}>Naam</label>
              <input type="text" placeholder="Jan Janssen" value={form.contact_naam}
                onChange={e => set('contact_naam', e.target.value)} className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className={labelCls}>Telefoonnummer</label>
              <input type="tel" placeholder="+32 475 12 34 56" value={form.contact_telefoon}
                onChange={e => set('contact_telefoon', e.target.value)} className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className={labelCls}>E-mail zaal</label>
              <input type="email" placeholder="info@feestzaal.be" value={form.contact_email}
                onChange={e => set('contact_email', e.target.value)} className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className={labelCls}>Website</label>
              <input type="url" placeholder="https://www.feestzaal.be" value={form.website}
                onChange={e => set('website', e.target.value)} className={`mt-1 ${inputCls}`} />
            </div>
          </div>

          {/* Geluid */}
          <div className="space-y-3 pt-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Geluid</p>
            <div>
              <label className={labelCls}>Geluidsbeperking</label>
              <div className="flex gap-2 mt-1 rounded-xl overflow-hidden border border-gray-200">
                <ToggleBtn active={!form.geluidsbeperking} onClick={() => set('geluidsbeperking', false)} label="Geen begrenzer" />
                <ToggleBtn active={form.geluidsbeperking} onClick={() => set('geluidsbeperking', true)} label="⚠️ Begrenzer" />
              </div>
            </div>
            {form.geluidsbeperking && (
              <div>
                <label className={labelCls}>Geluidslimiet (dB)</label>
                <input type="number" min="50" max="140" placeholder="95" value={form.geluidsbeperking_db}
                  onChange={e => set('geluidsbeperking_db', e.target.value)} className={`mt-1 ${inputCls}`} />
              </div>
            )}
          </div>

          {/* Apparatuur */}
          <div className="space-y-2 pt-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Aanwezige installatie</p>
            <div className="grid grid-cols-2 gap-0.5">
              <CheckToggle checked={form.speakers_aanwezig} onChange={v => set('speakers_aanwezig', v)} label="🔊 Speakers" />
              <CheckToggle checked={form.licht_aanwezig} onChange={v => set('licht_aanwezig', v)} label="💡 Licht" />
              <CheckToggle checked={form.micro_aanwezig} onChange={v => set('micro_aanwezig', v)} label="🎤 Micro" />
              <CheckToggle checked={form.dj_booth_aanwezig} onChange={v => set('dj_booth_aanwezig', v)} label="🎧 DJ Booth" />
              <CheckToggle checked={form.uplights_aanwezig} onChange={v => set('uplights_aanwezig', v)} label="✨ Uplights" />
              <CheckToggle checked={form.speakers_buiten} onChange={v => set('speakers_buiten', v)} label="🏕 Speakers buiten" />
            </div>
          </div>

          {/* Logistiek */}
          <div className="space-y-3 pt-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Logistiek</p>
            <div>
              <label className={labelCls}>Parkeermogelijkheden</label>
              <textarea rows={2} placeholder="Parking achteraan het gebouw, gratis" value={form.parkeren_info}
                onChange={e => set('parkeren_info', e.target.value)}
                className={`mt-1 ${inputCls} resize-none`} />
            </div>
            <div>
              <label className={labelCls}>Gelijkvloers / toegankelijkheid</label>
              <div className="flex gap-2 mt-1 rounded-xl overflow-hidden border border-gray-200">
                <ToggleBtn active={form.gelijkvloers} onClick={() => set('gelijkvloers', true)} label="✓ Gelijkvloers" />
                <ToggleBtn active={!form.gelijkvloers} onClick={() => set('gelijkvloers', false)} label="Trappen aanwezig" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Wifi-code</label>
              <input type="text" placeholder="feest2024" value={form.wifi_code}
                onChange={e => set('wifi_code', e.target.value)} className={`mt-1 ${inputCls}`} />
            </div>
            <div>
              <label className={labelCls}>Afstand vanuit Deinze</label>
              <div className="flex gap-2 mt-1">
                <div className="flex-1 relative">
                  <input type="number" min="0" step="0.1" placeholder="0.0" value={form.afstand_km}
                    onChange={e => set('afstand_km', e.target.value)} className={inputCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">km</span>
                </div>
                <div className="flex-1 relative">
                  <input type="number" min="0" step="1" placeholder="0" value={form.rijtijd_min}
                    onChange={e => set('rijtijd_min', e.target.value)} className={inputCls} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">min</span>
                </div>
              </div>
            </div>
          </div>

          {/* Foto's */}
          <div className="space-y-2 pt-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Foto's</p>
            {form.fotos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.fotos.map((key, idx) => (
                  <div key={key} className="relative">
                    <img src={`${API_ROOT}/api/uploads/${key}`} alt=""
                      className="w-16 h-16 rounded-xl object-cover bg-gray-100" />
                    <button type="button" onClick={() => removePhoto(idx)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handleUploadPhoto} className="hidden" />
            <button type="button" onClick={() => photoInputRef.current?.click()} disabled={uploadingPhoto}
              className="flex items-center gap-2 border border-dashed border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-500 hover:border-teal-400 hover:text-teal-600 transition-colors w-full justify-center">
              {uploadingPhoto ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploadingPhoto ? 'Uploaden...' : 'Foto toevoegen'}
            </button>
          </div>

          {/* Notities */}
          <div className="pt-1">
            <label className={labelCls}>Notities</label>
            <textarea rows={3} placeholder="Laadtijd: 30 min voor aanvang. Stopcontact achteraan links..." value={form.notities}
              onChange={e => set('notities', e.target.value)}
              className={`mt-1 ${inputCls} resize-none`} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 py-2.5 rounded-xl font-medium transition-colors text-sm">
              Annuleren
            </button>
            <button type="submit" disabled={loading || !form.naam.trim()}
              className="flex-1 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white py-2.5 rounded-xl font-semibold transition-colors text-sm">
              {loading ? 'Opslaan...' : venue ? 'Opslaan' : 'Aanmaken'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── VenueDetailModal ───────────────────────────────────────────────────────────

function VenueDetailModal({
  venue,
  onClose,
  onEdit,
  onDeleted
}: {
  venue: Venue
  onClose: () => void
  onEdit: () => void
  onDeleted: () => void
}) {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'info' | 'boekingen'>('info')
  const [bookings, setBookings] = useState<VenueBooking[]>([])
  const [loadingBookings, setLoadingBookings] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (tab === 'boekingen') {
      setLoadingBookings(true)
      getVenueBookings(venue.id).then(b => {
        setBookings(b)
        setLoadingBookings(false)
      })
    }
  }, [tab, venue.id])

  const fotos = parseFotos(venue.fotos)

  const handleDelete = async () => {
    const cnt = venue.booking_count ?? 0
    const msg = cnt > 0
      ? `Zaal "${venue.naam}" verwijderen?\n\nDeze zaal is gekoppeld aan ${cnt} boeking${cnt !== 1 ? 'en' : ''}. De boekingen zelf blijven bewaard, maar de koppeling met deze zaal wordt verbroken.`
      : `Zaal "${venue.naam}" verwijderen?`
    if (!confirm(msg)) return
    setDeleting(true)
    setDeleteError(null)
    const res = await deleteVenue(venue.id, cnt > 0)
    if (res.success) {
      onDeleted()
      onClose()
    } else {
      setDeleteError(res.error || 'Verwijderen mislukt')
    }
    setDeleting(false)
  }

  const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) => {
    if (!value) return null
    return (
      <div className="flex items-start gap-2.5">
        <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>
        <div>
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
          <p className="text-sm text-gray-800 mt-0.5">{value}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-[0_8px_40px_rgba(0,0,0,0.18)] my-4 overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-teal-500 to-cyan-500 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {fotos.length > 0 ? (
                <img src={`${API_ROOT}/api/uploads/${fotos[0]}`} alt=""
                  className="w-12 h-12 rounded-xl object-cover border-2 border-white/30" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <Building2 size={22} className="text-white" />
                </div>
              )}
              <div>
                <h2 className="font-bold text-white text-base leading-tight">{venue.naam}</h2>
                <p className="text-xs text-white/70 mt-0.5">{venue.adres || 'Geen adres'}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-xl text-white/70 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {venue.capaciteit && (
              <span className="flex items-center gap-1 text-xs text-white/80">
                <Users size={11} /> {venue.capaciteit} personen
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-white/80">
              <Calendar size={11} /> {venue.booking_count ?? 0} boeking{(venue.booking_count ?? 0) !== 1 ? 'en' : ''}
            </span>
            {rijtijdLabel(venue) && (
              <span className="flex items-center gap-1 text-xs text-white font-semibold bg-white/20 px-2 py-0.5 rounded-full">
                <Car size={11} /> {rijtijdLabel(venue)}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {(['info', 'boekingen'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                tab === t ? 'text-teal-600 border-b-2 border-teal-500 bg-teal-50/50' : 'text-gray-400 hover:text-gray-600'
              }`}>
              {t === 'info' ? 'Info' : `Boekingen (${venue.booking_count ?? 0})`}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-5">
          {tab === 'info' && (
            <>
              {/* Contact */}
              {(venue.contact_naam || venue.contact_telefoon || venue.contact_email || venue.website) && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Contact</p>
                  <InfoRow icon={<Users size={14} />} label="Naam" value={venue.contact_naam} />
                  <InfoRow icon={<Phone size={14} />} label="Telefoon" value={venue.contact_telefoon} />
                  {venue.contact_email && (
                    <a href={`mailto:${venue.contact_email}`} className="flex items-start gap-2.5 text-sm text-teal-600 hover:text-teal-700">
                      <Mail size={14} className="mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">E-mail</p>
                        <p className="mt-0.5 break-all">{venue.contact_email}</p>
                      </div>
                    </a>
                  )}
                  {venue.website && (
                    <a href={venue.website.startsWith('http') ? venue.website : `https://${venue.website}`} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2.5 text-sm text-teal-600 hover:text-teal-700">
                      <Globe size={14} className="mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">Website</p>
                        <p className="mt-0.5 break-all">{venue.website}</p>
                      </div>
                    </a>
                  )}
                </div>
              )}

              {/* Geluid */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Geluid</p>
                {venue.geluidsbeperking ? (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    <VolumeX size={16} className="text-red-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-700">Geluidsbeperking aanwezig</p>
                      {venue.geluidsbeperking_db && (
                        <p className="text-xs text-red-500">Max. {venue.geluidsbeperking_db} dB</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    <Volume2 size={16} className="text-green-600 flex-shrink-0" />
                    <p className="text-sm text-green-700 font-medium">Geen geluidsbeperking</p>
                  </div>
                )}
              </div>

              {/* Apparatuur */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Installatie</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { key: 'speakers_aanwezig', label: '🔊 Speakers' },
                    { key: 'licht_aanwezig', label: '💡 Licht' },
                    { key: 'micro_aanwezig', label: '🎤 Micro' },
                    { key: 'dj_booth_aanwezig', label: '🎧 DJ Booth' },
                    { key: 'uplights_aanwezig', label: '✨ Uplights' },
                    { key: 'speakers_buiten', label: '🏕 Speakers buiten' },
                  ].map(({ key, label }) => {
                    const active = !!(venue as unknown as Record<string, unknown>)[key]
                    return (
                      <div key={key} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border ${
                        active
                          ? 'bg-green-50 border-green-200 text-green-700 font-medium'
                          : 'bg-gray-50 border-gray-100 text-gray-300'
                      }`}>
                        <span>{active ? '✓' : '✗'}</span>
                        <span>{label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Logistiek */}
              {(venue.parkeren_info || venue.wifi_code || venue.gelijkvloers !== undefined) && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Logistiek</p>
                  <InfoRow icon={<Car size={14} />} label="Parkeren" value={venue.parkeren_info} />
                  <InfoRow icon={<Wifi size={14} />} label="Wifi-code" value={venue.wifi_code} />
                  {venue.gelijkvloers !== undefined && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${venue.gelijkvloers ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                        {venue.gelijkvloers ? '✓' : '✗'}
                      </span>
                      Gelijkvloers / toegankelijk
                    </div>
                  )}
                </div>
              )}

              {/* Foto's */}
              {fotos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Foto's</p>
                  <div className="grid grid-cols-3 gap-2">
                    {fotos.map((key, i) => (
                      <img key={i} src={`${API_ROOT}/api/uploads/${key}`} alt=""
                        className="w-full aspect-square rounded-xl object-cover bg-gray-100" />
                    ))}
                  </div>
                </div>
              )}

              {/* Notities */}
              {venue.notities && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Notities</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-xl p-3">{venue.notities}</p>
                </div>
              )}

              {/* Acties */}
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button onClick={onEdit}
                  className="flex-1 flex items-center justify-center gap-2 bg-teal-50 hover:bg-teal-100 text-teal-700 py-2.5 rounded-xl text-sm font-semibold transition-colors">
                  <Edit2 size={14} /> Bewerken
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 bg-red-50 hover:bg-red-100 text-red-600"
                  title={(venue.booking_count ?? 0) > 0 ? `Verwijderen (${venue.booking_count} koppeling${(venue.booking_count ?? 0) !== 1 ? 'en' : ''} worden verbroken)` : 'Verwijderen'}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {deleteError && (
                <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <AlertTriangle size={12} /> {deleteError}
                </div>
              )}
            </>
          )}

          {tab === 'boekingen' && (
            <div className="space-y-2">
              {loadingBookings ? (
                <p className="text-center text-gray-400 py-8 animate-pulse">Laden...</p>
              ) : bookings.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">Nog geen boekingen in deze zaal</p>
              ) : (
                bookings.map(b => (
                  <button key={b.id} onClick={() => navigate(`/boeking/${b.id}`)}
                    className="w-full flex items-center gap-3 bg-gray-50 hover:bg-gray-100 rounded-xl px-4 py-3 transition-colors text-left">
                    <span className="text-lg">{b.type_feest === 'Trouw' ? '💍' : '🎉'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{displayNaamVenue(b)}</p>
                      <p className="text-xs text-gray-400">
                        {b.feest_datum ? format(parseISO(b.feest_datum), 'd MMM yyyy', { locale: nl }) : '—'}
                        {b.is_aanvraag ? ' · Aanvraag' : ''}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-gray-300" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Hoofdpagina Venues ─────────────────────────────────────────────────────────

export function Venues() {
  const navigate = useNavigate()
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; linked: number; skipped: number } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editVenue, setEditVenue] = useState<Venue | null>(null)
  const [detailVenue, setDetailVenue] = useState<Venue | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const data = await getVenues()
    setVenues(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleImport = async () => {
    if (!confirm('Bestaande locaties uit boekingen importeren als zalen? Reeds bestaande zalen worden overgeslagen.')) return
    setImporting(true)
    const res = await populateVenuesFromBookings()
    setImportResult({ created: res.created, linked: res.linked, skipped: res.skipped })
    await load(true)
    setImporting(false)
  }

  const filtered = venues.filter(v =>
    v.naam.toLowerCase().includes(search.toLowerCase()) ||
    (v.adres || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleOpenDetail = (venue: Venue) => {
    setDetailVenue(venue)
    setEditVenue(null)
  }

  const handleEdit = () => {
    if (!detailVenue) return
    setEditVenue(detailVenue)
    setDetailVenue(null)
  }

  const handleSaved = () => {
    load(true)
    setEditVenue(null)
    setShowForm(false)
    // Herlaad detail als het open was
    if (detailVenue) {
      setDetailVenue(null)
    }
  }

  const handleDeleted = () => {
    load(true)
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      {/* Header */}
      <header className="sticky top-0 z-40">
        <div className="bg-gradient-to-r from-teal-500 via-cyan-500 to-[#007AFF] px-4 sm:px-6 pb-4 safe-top">
          <div className="max-w-4xl mx-auto flex items-center gap-3 pt-4">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-white/20 rounded-xl text-white/80 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3 flex-1">
              <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <Building2 size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-bold text-base text-white">Zalen</h1>
                <p className="text-xs text-white/70">{venues.length} locatie{venues.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <button onClick={() => load(true)} className="p-2 hover:bg-white/20 rounded-xl text-white/70 hover:text-white transition-colors">
              <RefreshCw size={16} />
            </button>
            <button onClick={handleImport} disabled={importing}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors">
              {importing ? <RefreshCw size={12} className="animate-spin" /> : <Download size={12} />}
              Importeren
            </button>
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/60" />
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-6 space-y-4">

        {/* Import resultaat */}
        {importResult && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-green-700">Import voltooid</p>
              <p className="text-xs text-green-600 mt-0.5">
                {importResult.created} nieuwe zalen aangemaakt · {importResult.linked} boekingen gekoppeld · {importResult.skipped} overgeslagen
              </p>
            </div>
            <button onClick={() => setImportResult(null)} className="text-green-500 hover:text-green-700">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Zoeken + knop */}
        <div className="flex gap-3 items-center">
          <input
            type="text"
            placeholder="Zoeken op naam of adres..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-white border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20 shadow-sm transition-all"
          />
          <button onClick={() => { setEditVenue(null); setShowForm(true) }}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap shadow-sm">
            <Plus size={16} /> Nieuwe Zaal
          </button>
        </div>

        {/* Lijst */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 animate-pulse">Zalen laden...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Building2 size={48} className="mx-auto text-gray-200 mb-4" />
            {search ? (
              <p className="text-gray-400 text-sm">Geen zalen gevonden voor "{search}"</p>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-500 font-medium">Nog geen zalen</p>
                <p className="text-gray-400 text-sm">Voeg een zaal toe of importeer locaties uit je boekingen.</p>
                <div className="flex gap-2 justify-center mt-4">
                  <button onClick={() => setShowForm(true)}
                    className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
                    <Plus size={14} /> Nieuwe Zaal
                  </button>
                  <button onClick={handleImport} disabled={importing}
                    className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                    <Download size={14} /> Importeren uit boekingen
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(venue => (
              <VenueCard key={venue.id} venue={venue} onClick={() => handleOpenDetail(venue)} />
            ))}
          </div>
        )}
      </main>

      <BottomTabBar />

      {/* Modals */}
      {showForm && (
        <VenueFormModal venue={null} onClose={() => setShowForm(false)} onSaved={handleSaved} />
      )}
      {editVenue && (
        <VenueFormModal venue={editVenue} onClose={() => setEditVenue(null)} onSaved={handleSaved} />
      )}
      {detailVenue && (
        <VenueDetailModal
          venue={detailVenue}
          onClose={() => setDetailVenue(null)}
          onEdit={handleEdit}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
