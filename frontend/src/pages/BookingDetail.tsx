import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Music2, Clock,
  Mic, Speaker, Lightbulb, CheckCircle2, XCircle,
  Printer, Copy, Heart, Volume2, Zap, Star, Phone,
  FileText, Upload, Euro, Save, Download, ExternalLink, RefreshCw
} from 'lucide-react'
import { getBooking, updateStatus, updateContractInfo, updateBasisInfo, updatePortalSettings, confirmBooking } from '../lib/api'
import { Booking } from '../types/booking'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import { generateContractPDFBase64 } from '../lib/contractPDF'
import { WorkspaceTabs } from '../features/event-workspace/components/WorkspaceTabs'
import { EventWorkspace } from '../features/event-workspace/EventWorkspace'
import { WorkspaceTab } from '../features/event-workspace/types'

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
        <span className="text-[#007AFF]">{icon}</span>{title}
      </h3>
      {children}
    </div>
  )
}

function parseTweedeDans(raw?: string | null): string {
  if (!raw) return ''
  if (!raw.startsWith('MULTI:')) return raw
  try {
    const items = JSON.parse(raw.slice(6)) as { key: string; nummer: string }[]
    return items.map(i => {
      if (i.key === 'tweede_dans') return `Tweede dans (ouders)${i.nummer ? `: ${i.nummer}` : ''}`
      if (i.key === 'derde_dans') return `Derde dans (gasten)${i.nummer ? `: ${i.nummer}` : ''}`
      if (i.key === 'direct_feest') return 'Direct beginnen met het feest'
      if (i.key === 'dj_kiest') return 'DJ kiest zelf'
      if (i.key === 'eigen_nummer') return `Start feest met: ${i.nummer || '—'}`
      return i.nummer ? `${i.key}: ${i.nummer}` : i.key
    }).join(' · ')
  } catch { return raw }
}


function formatLeveranciers(raw?: string | null): string | null {
  if (!raw) return null
  try {
    const labels: Record<string, string> = {
      catering: 'Catering', fotograaf: 'Fotograaf', videograaf: 'Videograaf',
      ceremoniemeester: 'Ceremoniemeester', weddingplanner: 'Weddingplanner'
    }
    const parsed = JSON.parse(raw) as Record<string, string>
    const lines = Object.entries(parsed).filter(([, v]) => String(v || '').trim()).map(([k, v]) => `${labels[k] || k}: ${v}`)
    return lines.length ? lines.join('\n') : null
  } catch { return raw }
}

function Field({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (!value && value !== 0) return null
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wider">{label}</dt>
      <dd className={`text-gray-900 mt-0.5 ${mono ? 'font-mono text-sm' : 'text-sm'}`}>{value}</dd>
    </div>
  )
}

function BoolField({ label, value, icon }: { label: string; value?: number | null; icon?: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-2 p-2.5 rounded-xl border text-sm ${
      value
        ? 'bg-green-50 border-green-200 text-green-700'
        : 'bg-gray-50 border-gray-200 text-gray-400'
    }`}>
      {icon && <span>{icon}</span>}
      {value ? <CheckCircle2 size={14} className="flex-shrink-0" /> : <XCircle size={14} className="flex-shrink-0" />}
      <span className="font-medium text-xs">{label}</span>
    </div>
  )
}

// Mapping van DB-veldnaam naar leesbare label
const FIELD_LABELS: Record<string, string> = {
  naam_organisator: 'Naam organisator', naam_partner1: 'Partner 1', naam_partner2: 'Partner 2',
  email: 'E-mail', telefoon: 'Telefoon', adres_organisator: 'Adres',
  locatie_naam: 'Locatienaam', locatie_adres: 'Locatieadres', aantal_gasten: 'Aantal gasten',
  thema: 'Thema', publiek_leeftijd: 'Publiek leeftijd', parkeren_info: 'Parkeren',
  backup_contact_naam: 'Backup contact naam', backup_contact_telefoon: 'Backup contact tel.',
  verzoeknummers: 'Verzoeknummers',
  uur_ceremonie: 'Uur ceremonie', uur_receptie: 'Uur receptie', uur_receptie_einde: 'Receptie einde',
  uur_receptie2: 'Receptie 2', uur_receptie2_einde: 'Receptie 2 einde',
  uur_diner: 'Uur diner', uur_dessert: 'Uur dessert', uur_dansfeest: 'Uur dansfeest',
  uur_midnightsnack: 'Midnight snack', einduur: 'Einduur', planning_extra: 'Planning extra', einde_feest: 'Einde feest',
  top_genres: 'Top genres', top_genres_extra: 'Top genres extra',
  flop_genres: 'Flop genres', flop_genres_extra: 'Flop genres extra',
  must_play: 'Must play', do_not_play: 'Do not play',
  spotify_link: 'Spotify link', muziek_receptie: 'Muziek receptie', muziek_receptie_extra: 'Receptie extra',
  muziek_diner: 'Muziek diner', muziek_diner_extra: 'Diner extra',
  intrede_zaal_nummer: 'Intrede zaal', intrede_eretafel_nummer: 'Intrede eretafel',
  intrede_bridesmaids_nummer: 'Intrede bridesmaids', intrede_groomsmen_nummer: 'Intrede groomsmen',
  intrede_koppel_nummer: 'Intrede koppel', intrede_anders_nummer: 'Intrede anders',
  intrede_taart_nummer: 'Intrede taart',
  openingsdans_nummer: 'Openingsdans', tweede_dans_nummer: 'Tweede dans',
  boeket_werpen_nummer: 'Boeket werpen', verjaardag_naam_leeftijd: 'Jarige',
  zaal_contact: 'Zaal contact', leveranciers_info: 'Leveranciers / partners', geluidsbeperking_info: 'Geluidsbeperking', wifi_code: 'Wifi code',
  speakers_aanwezig: 'Speakers aanwezig', licht_aanwezig: 'Licht aanwezig', micro_aanwezig: 'Micro aanwezig',
  dj_booth_aanwezig: 'DJ booth', uplights_aanwezig: 'Uplights', speakers_buiten: 'Speakers buiten',
  ceremonie_set: 'Ceremonie set', digital_booth: 'Digital booth', retro_booth: 'Retro booth',
  draadloze_speaker: 'Draadloze speaker', karaoke: 'Karaoke',
  toestemming_foto: 'Toestemming foto', opmerkingen: 'Opmerkingen',
}

function formatDiffVal(val: unknown): string {
  if (val === null || val === undefined || val === '') return '(leeg)'
  if (val === '0' || val === 0) return 'Nee'
  if (val === '1' || val === 1) return 'Ja'
  return String(val)
}

function VragenlijstOverzichtModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  // Probeer diff te parsen (aanwezig vanaf de tweede aanpassing)
  let diff: Record<string, { oud: unknown; nieuw: unknown }> | null = null
  if (booking.vragenlijst_diff) {
    try { diff = JSON.parse(booking.vragenlijst_diff) } catch { diff = null }
  }

  const hasDiff = diff && Object.keys(diff).length > 0

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-[0_8px_40px_rgba(0,0,0,0.20)] my-8">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold">!</span>
              Vragenlijst aangepast
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {booking.vragenlijst_updated_at
                ? `Gewijzigd op ${new Date(booking.vragenlijst_updated_at).toLocaleString('nl-BE')}`
                : 'Overzicht van aanpassingen'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition-colors">
            <XCircle size={18} />
          </button>
        </div>

        <div className="p-5 max-h-[65vh] overflow-y-auto">
          {hasDiff ? (
            // ── Diff-weergave: enkel gewijzigde velden ──
            <div className="space-y-3">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3">
                {Object.keys(diff!).length} veld{Object.keys(diff!).length !== 1 ? 'en' : ''} gewijzigd
              </p>
              {Object.entries(diff!).map(([field, { oud, nieuw }]) => (
                <div key={field} className="rounded-xl border border-amber-100 bg-amber-50/50 overflow-hidden">
                  <div className="px-3 py-1.5 bg-amber-100/60 border-b border-amber-100">
                    <span className="text-xs font-semibold text-amber-800">{FIELD_LABELS[field] || field}</span>
                  </div>
                  <div className="px-3 py-2 space-y-1.5">
                    {oud !== null && oud !== '' ? (
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-red-400 w-8 flex-shrink-0 pt-0.5">Oud</span>
                        <span className="text-sm text-red-600 line-through break-words flex-1">{formatDiffVal(oud)}</span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-medium text-gray-300 w-8 flex-shrink-0 pt-0.5">Oud</span>
                        <span className="text-sm text-gray-300 italic">leeg</span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-medium text-green-500 w-8 flex-shrink-0 pt-0.5">Nieuw</span>
                      <span className="text-sm text-green-700 font-medium break-words flex-1">{formatDiffVal(nieuw)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // ── Fallback: geen diff beschikbaar (eerste aanpassing vóór deze feature) ──
            <div className="text-center py-6 space-y-2">
              <p className="text-sm text-gray-500">Geen gedetailleerde wijzigingen beschikbaar.</p>
              <p className="text-xs text-gray-400">De diff wordt bijgehouden vanaf de volgende aanpassing.</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100">
          <a
            href={`/event/${booking.slug || booking.id}?section=vragenlijst`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors">
            Bekijk via klantpagina →
          </a>
        </div>
      </div>
    </div>
  )
}

function StatusToggle({ label, value, onToggle }: { label: string; value: number; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border font-semibold text-sm transition-all ${
        value
          ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
          : 'bg-red-50 border-red-200 text-red-500 hover:bg-red-100'
      }`}>
      {value ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      {label}
    </button>
  )
}

export function BookingDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [showVragenlijstModal, setShowVragenlijstModal] = useState(false)
  const [contractForm, setContractForm] = useState({ totaalprijs: '', basisprijs: '', extra_prijzen: '{}', adres_organisator: '', voorschot_instructies: '' })
  const [contractSaving, setContractSaving] = useState(false)
  const [contractGenerating, setContractGenerating] = useState(false)
  const [factuurUploading, setFactuurUploading] = useState(false)
  const [basisInfoSaving, setBasisInfoSaving] = useState(false)
  const [basisInfoForm, setBasisInfoForm] = useState({ naam_organisator: '', naam_partner1: '', naam_partner2: '', email: '', telefoon: '', feest_datum: '', created_at: '' })
  const [portalTitle, setPortalTitle] = useState('')
  const [portalSaving, setPortalSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const DEFAULT_EXTRA_PRIJZEN: Record<string, number> = {
    ceremonie_set: 250,
    digital_booth: 175,
    draadloze_speaker: 25,
    karaoke: 150,
  }

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const data = await getBooking(id)
    setBooking(data)
    if (data) {
      // Auto-fill standaardprijzen voor geselecteerde extra's zonder prijs
      let extraPrijzen: Record<string, string> = {}
      try { extraPrijzen = JSON.parse(data.extra_prijzen || '{}') } catch {}
      for (const [key, defaultPrijs] of Object.entries(DEFAULT_EXTRA_PRIJZEN)) {
        const isGeselecteerd = !!(data as unknown as Record<string, unknown>)[key]
        if (isGeselecteerd && !extraPrijzen[key]) {
          extraPrijzen[key] = String(defaultPrijs)
        }
      }
      const extraPrijzenStr = JSON.stringify(extraPrijzen)

      setPortalTitle(data.portal_title || '')
      setContractForm({
        totaalprijs: data.totaalprijs ? String(data.totaalprijs) : '',
        basisprijs: data.basisprijs ? String(data.basisprijs) : '',
        extra_prijzen: extraPrijzenStr,
        adres_organisator: data.adres_organisator || '',
        voorschot_instructies: data.voorschot_instructies || '',
      })
      setBasisInfoForm({
        naam_organisator: data.naam_organisator || '',
        naam_partner1: data.naam_partner1 || '',
        naam_partner2: data.naam_partner2 || '',
        email: data.email || '',
        telefoon: data.telefoon || '',
        feest_datum: data.feest_datum || '',
        created_at: data.created_at ? data.created_at.slice(0, 10) : '',
      })
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const toggleStatus = async (field: 'status_contract' | 'status_voorschot') => {
    if (!booking) return
    const newVal = booking[field] ? 0 : 1
    await updateStatus(booking.id, { [field]: newVal })
    // Bij contract bevestigen (0→1): PDF genereren en opslaan in DB
    if (field === 'status_contract' && newVal === 1) {
      const pdfBase64 = await generateContractPDFBase64(booking)
      await updateContractInfo(booking.id, { contract_pdf: pdfBase64 })
      setBooking(prev => prev ? { ...prev, [field]: newVal, contract_pdf: pdfBase64 } : prev)
    } else {
      setBooking(prev => prev ? { ...prev, [field]: newVal } : prev)
    }
  }

  const saveContractInfo = async () => {
    if (!booking) return
    setContractSaving(true)
    const payload = {
      basisprijs: contractForm.basisprijs ? parseFloat(contractForm.basisprijs) : 0,
      extra_prijzen: contractForm.extra_prijzen,
      totaalprijs: contractForm.totaalprijs ? parseFloat(contractForm.totaalprijs) : 0,
      adres_organisator: contractForm.adres_organisator,
      voorschot_instructies: contractForm.voorschot_instructies ||
        'Voor de bevestiging van uw boeking vragen wij een vast voorschot van € 100,00. U kunt dit eenvoudig betalen via de QR-code op de bijgevoegde Billit-factuur.',
    }
    await updateContractInfo(booking.id, payload)
    setBooking(prev => prev ? { ...prev, ...payload } : prev)
    setContractSaving(false)
  }

  const openContractInfoForCustomer = async () => {
    if (!booking) return
    const code = prompt('Voer de code in om Contract Info opnieuw open te zetten voor de klant:')
    if (code !== '7777') { if (code !== null) alert('Ongeldige code.'); return }
    await updateContractInfo(booking.id, { contract_info_unlocked: 1 })
    setBooking(prev => prev ? { ...prev, contract_info_unlocked: 1 } : prev)
    alert('Contract Info staat opnieuw open op de klantpagina. De bestaande PDF blijft bewaard tot je het contract hernieuwt.')
  }

  const closeContractInfoForCustomer = async () => {
    if (!booking) return
    await updateContractInfo(booking.id, { contract_info_unlocked: 0 })
    setBooking(prev => prev ? { ...prev, contract_info_unlocked: 0 } : prev)
  }

  const saveBasisInfo = async () => {
    if (!booking) return
    setBasisInfoSaving(true)
    await updateBasisInfo(booking.id, basisInfoForm)
    // Adres apart opslaan via contract endpoint
    await updateContractInfo(booking.id, { adres_organisator: contractForm.adres_organisator })
    setBooking(prev => prev ? { ...prev, ...basisInfoForm, adres_organisator: contractForm.adres_organisator } : prev)
    setBasisInfoSaving(false)
  }

  const handleFeestDatumChange = (val: string) => {
    setBasisInfoForm(p => ({ ...p, feest_datum: val }))
  }

  const handleFactuurUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!booking || !e.target.files?.[0]) return
    const file = e.target.files[0]
    if (!file.name.toLowerCase().endsWith('.pdf')) { alert('Alleen PDF-bestanden toegestaan'); return }
    if (file.size > 5 * 1024 * 1024) { alert('Bestand mag max 5MB zijn'); return }
    setFactuurUploading(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1]
      await updateContractInfo(booking.id, { billit_factuur_pdf: base64, billit_factuur_naam: file.name })
      setBooking(prev => prev ? { ...prev, billit_factuur_pdf: base64, billit_factuur_naam: file.name } : prev)
      setFactuurUploading(false)
    }
    reader.readAsDataURL(file)
  }

  const openFactuur = async () => {
    if (!booking) return
    const pdfBase64 = await import('../lib/api').then(m => m.getBookingPDF(String(booking.id), 'factuur'))
    if (!pdfBase64) { alert('Factuur niet beschikbaar'); return }
    const byteStr = atob(pdfBase64)
    const bytes = new Uint8Array(byteStr.length).map((_, i) => byteStr.charCodeAt(i))
    const blob = new Blob([bytes], { type: 'application/pdf' })
    window.open(URL.createObjectURL(blob), '_blank')
  }

  const portalUrl = () => `${window.location.origin}/event/${booking?.slug || id}`

  const copyPortalLink = () => {
    const url = portalUrl()
    navigator.clipboard.writeText(url)
    alert(`Klantpagina-link gekopieerd!\n\nStuur deze link naar je klant:\n${url}`)
  }

  const savePortalTitle = async () => {
    if (!booking) return
    setPortalSaving(true)
    await updatePortalSettings(booking.id, { portal_title: portalTitle })
    setBooking(prev => prev ? { ...prev, portal_title: portalTitle } : prev)
    setPortalSaving(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center">
      <div className="text-gray-400 animate-pulse">Laden...</div>
    </div>
  )

  if (!booking) return (
    <div className="min-h-screen bg-[#F2F2F7] flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-500 mb-4">Boeking niet gevonden</p>
        <button onClick={() => navigate('/')} className="text-[#007AFF] hover:text-[#0066CC]">← Terug</button>
      </div>
    </div>
  )

  const isTrouw = booking.type_feest === 'Trouw'
  const isAanvraag = !!booking.is_aanvraag
  const workspaceTabs: WorkspaceTab[] = ['overzicht', 'contract', 'vragenlijst', 'bestanden', 'communicatie']
  const activeWorkspaceTab = workspaceTabs.includes(searchParams.get('tab') as WorkspaceTab)
    ? (searchParams.get('tab') as WorkspaceTab)
    : 'overzicht'
  const setActiveWorkspaceTab = (tab: WorkspaceTab) => {
    const next = new URLSearchParams(searchParams)
    if (tab === 'overzicht') next.delete('tab')
    else next.set('tab', tab)
    setSearchParams(next)
  }

  const handleConfirmBooking = async () => {
    if (!confirm('Aanvraag bevestigen als boeking? Contract en voorschot opvolging wordt geactiveerd.')) return
    await confirmBooking(booking.id)
    setBooking(prev => prev ? { ...prev, is_aanvraag: 0 } : prev)
  }

  return (<>
    <div className="min-h-screen bg-[#F2F2F7]">
      {/* Header with gradient */}
      <header className="sticky top-0 z-40">
        <div className={`px-4 sm:px-6 pb-5 safe-top ${
          isAanvraag
            ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-orange-400'
            : isTrouw
              ? 'bg-gradient-to-r from-pink-500 via-rose-400 to-pink-400'
              : 'bg-gradient-to-r from-[#007AFF] via-[#5856D6] to-[#AF52DE]'
        }`}>
          <div className="max-w-5xl mx-auto flex items-center gap-4 pt-4">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-white/20 rounded-xl text-white/80 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-lg flex-shrink-0">
                {isTrouw ? '💍' : '🎉'}
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-base text-white truncate">
                  {isTrouw && (booking.naam_partner1 || booking.naam_partner2)
                    ? [[booking.naam_partner1, booking.naam_partner2].filter(Boolean).map(n => n!.split(' ')[0]).join(' & ')]
                    : booking.naam_organisator || 'Boeking'}
                </h1>
                <p className="text-xs text-white/70">
                  {booking.feest_datum ? format(parseISO(booking.feest_datum), 'EEEE d MMMM yyyy', { locale: nl }) : '—'}
                  {' · '}{booking.type_feest}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={copyPortalLink}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white px-3 py-2 rounded-xl text-sm font-medium transition-colors">
                <Copy size={14} /> Klantpagina
              </button>
              <button onClick={() => navigate(`/gigsheet/${id}`)}
                className="flex items-center gap-1.5 bg-white text-gray-900 hover:bg-white/90 px-3 py-2 rounded-xl text-sm font-semibold transition-colors">
                <Printer size={14} /> Gig Sheet
              </button>
            </div>
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/60" />
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Aanvraag banner */}
        {isAanvraag && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="font-semibold text-amber-800 text-sm">📋 Dit is nog een aanvraag</p>
                <p className="text-xs text-amber-600 mt-0.5">Bevestig als boeking om contract, voorschot en vragenlijst te activeren.</p>
              </div>
              <button onClick={handleConfirmBooking}
                className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap">
                <CheckCircle2 size={15} /> Bevestig als boeking
              </button>
            </div>
            <div className="flex items-center gap-3 pt-1 border-t border-amber-200">
              <label className="text-xs font-medium text-amber-700 whitespace-nowrap">📅 Ontvangen op</label>
              <input
                type="date"
                value={basisInfoForm.created_at}
                onChange={e => setBasisInfoForm(p => ({ ...p, created_at: e.target.value }))}
                className="flex-1 bg-white border border-amber-200 text-gray-900 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-300/30 transition-all"
              />
              <button
                onClick={saveBasisInfo}
                disabled={basisInfoSaving}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap">
                <Save size={12} /> {basisInfoSaving ? '...' : 'Opslaan'}
              </button>
            </div>
          </div>
        )}

        <WorkspaceTabs active={activeWorkspaceTab} onChange={setActiveWorkspaceTab} />

        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Klantpagina titel</label>
              <input
                value={portalTitle}
                onChange={e => setPortalTitle(e.target.value)}
                placeholder={booking.naam_organisator || 'Jullie eventpagina'}
                className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all"
              />
            </div>
            <button onClick={savePortalTitle} disabled={portalSaving}
              className="flex items-center justify-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
              <Save size={14} /> {portalSaving ? '...' : 'Opslaan'}
            </button>
            <a href={`/event/${booking.slug || booking.id}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
              <ExternalLink size={14} /> Open klantpagina
            </a>
          </div>
        </div>

        {activeWorkspaceTab !== 'overzicht' ? (
          <EventWorkspace
            booking={booking}
            activeTab={activeWorkspaceTab}
            onShowQuestionnaireChanges={() => setShowVragenlijstModal(true)}
          />
        ) : (<>

        {/* Status Management — alleen voor bevestigde boekingen */}
        {!isAanvraag && (
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <FileText size={15} className="text-[#007AFF]" /> Status Beheer
          </h3>
          <div className="flex gap-3">
            <StatusToggle label="Contract" value={booking.status_contract} onToggle={() => toggleStatus('status_contract')} />
            <StatusToggle label="Voorschot" value={booking.status_voorschot} onToggle={() => toggleStatus('status_voorschot')} />
            <div className="flex-1 flex gap-2">
              <a
                href={`/event/${booking.slug || booking.id}?section=vragenlijst`}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border font-semibold text-sm transition-colors ${
                  booking.status_vragenlijst
                    ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                    : 'bg-gray-50 border-gray-200 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}>
                {booking.status_vragenlijst ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                Vragenlijst
              </a>
              {booking.vragenlijst_updated_at && booking.vragenlijst_first_submitted_at && (
                <button
                  onClick={() => setShowVragenlijstModal(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-xl border bg-amber-50 border-amber-300 text-amber-600 hover:bg-amber-100 font-bold text-sm transition-colors"
                  title="Vragenlijst is aangepast — klik voor overzicht">
                  <span className="text-base leading-none">!</span>
                  <span className="text-xs font-semibold">Aangepast</span>
                </button>
              )}
            </div>
          </div>
        </div>
        )}

        {/* Basisinfo bewerken */}
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Phone size={15} className="text-[#007AFF]" /> Contactgegevens
          </h3>
          <div className="space-y-3">
            {isTrouw ? (
              <div className="bg-pink-50 border border-pink-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-pink-500 uppercase tracking-wider">💍 Namen Koppel</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Partner 1</label>
                    <input type="text" placeholder="Voornaam Achternaam" value={basisInfoForm.naam_partner1}
                      onChange={e => setBasisInfoForm(p => ({...p, naam_partner1: e.target.value}))}
                      className="mt-1 w-full bg-white border border-pink-200 text-gray-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-400/20 placeholder-gray-400 transition-all" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Partner 2</label>
                    <input type="text" placeholder="Voornaam Achternaam" value={basisInfoForm.naam_partner2}
                      onChange={e => setBasisInfoForm(p => ({...p, naam_partner2: e.target.value}))}
                      className="mt-1 w-full bg-white border border-pink-200 text-gray-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-400/20 placeholder-gray-400 transition-all" />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Naam Organisator</label>
                <input type="text" placeholder="Voornaam Achternaam" value={basisInfoForm.naam_organisator}
                  onChange={e => setBasisInfoForm(p => ({...p, naam_organisator: e.target.value}))}
                  className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 placeholder-gray-400 transition-all" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">E-mail</label>
                <input type="email" placeholder="email@voorbeeld.be" value={basisInfoForm.email}
                  onChange={e => setBasisInfoForm(p => ({...p, email: e.target.value}))}
                  className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 placeholder-gray-400 transition-all" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Telefoon</label>
                <input type="tel" placeholder="+32 xxx xx xx xx" value={basisInfoForm.telefoon}
                  onChange={e => setBasisInfoForm(p => ({...p, telefoon: e.target.value}))}
                  className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 placeholder-gray-400 transition-all" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">📍 Adres Organisator</label>
              <input
                type="text" placeholder="Straat nr, postcode gemeente"
                value={contractForm.adres_organisator}
                onChange={e => setContractForm(p => ({ ...p, adres_organisator: e.target.value }))}
                className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">📅 Feestdatum</label>
              <input
                type="date"
                value={basisInfoForm.feest_datum}
                onChange={e => handleFeestDatumChange(e.target.value)}
                className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all"
              />
            </div>
            <button onClick={saveBasisInfo} disabled={basisInfoSaving}
              className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
              <Save size={14} /> {basisInfoSaving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>

        {/* Factuur & Contract — alleen voor bevestigde boekingen */}
        {!isAanvraag && <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Euro size={15} className="text-[#007AFF]" /> Factuur & Contract
          </h3>

          {/* Prijsopbouw */}
          {(() => {
            const EXTRA_LABELS: Record<string, string> = {
              ceremonie_set: 'Ceremonie Set',
              digital_booth: 'Digitale Photobooth',
              retro_booth: 'Photobooth met Prints',
              draadloze_speaker: 'Extra Luidspreker',
              karaoke: 'Karaoke',
            }
            let extraPrijzen: Record<string, string> = {}
            try { extraPrijzen = JSON.parse(contractForm.extra_prijzen || '{}') } catch {}

            const basisVal = contractForm.basisprijs ? parseFloat(contractForm.basisprijs) : 0
            const kortingVal = parseFloat(extraPrijzen['_korting'] || '0')
            let extrasTotal = 0
            for (const key of Object.keys(EXTRA_LABELS)) {
              const v = parseFloat(extraPrijzen[key] || '0')
              if (!isNaN(v)) extrasTotal += v
            }
            const kmVergoedingVal = parseFloat(extraPrijzen['_km_vergoeding'] || '0') || 0
            extrasTotal += kmVergoedingVal
            const totaal = Math.max(0, basisVal + extrasTotal - kortingVal)

            const recalc = (basis: string, prijzen: Record<string, string>) => {
              const b = parseFloat(basis) || 0
              const k = parseFloat(prijzen['_korting'] || '0')
              let e = 0
              for (const key of Object.keys(EXTRA_LABELS)) e += parseFloat(prijzen[key] || '0') || 0
              e += parseFloat(prijzen['_km_vergoeding'] || '0') || 0
              return String(Math.max(0, b + e - k))
            }

            const updateExtraPreis = (key: string, val: string) => {
              const updated = { ...extraPrijzen, [key]: val }
              setContractForm(p => ({ ...p, extra_prijzen: JSON.stringify(updated), totaalprijs: recalc(p.basisprijs, updated) }))
            }

            const updateBasis = (val: string) => {
              setContractForm(p => ({ ...p, basisprijs: val, totaalprijs: recalc(val, extraPrijzen) }))
            }

            const updateKorting = (val: string) => {
              const updated = { ...extraPrijzen, _korting: val }
              setContractForm(p => ({ ...p, extra_prijzen: JSON.stringify(updated), totaalprijs: recalc(p.basisprijs, updated) }))
            }

            const updateKm = (key: '_km_gratis' | '_km_afstand' | '_km_ritten' | '_km_prijs', val: string) => {
              const updated: Record<string, string> = { ...extraPrijzen, [key]: val }
              const gratis = parseFloat(updated._km_gratis || '20') || 0
              const afstand = parseFloat(updated._km_afstand || '0') || 0
              const ritten = parseFloat(updated._km_ritten || '2') || 0
              const prijs = parseFloat(updated._km_prijs || '0') || 0
              const vergoeding = Math.max(0, afstand - gratis) * ritten * prijs
              if (vergoeding > 0) updated._km_vergoeding = vergoeding.toFixed(2)
              else delete updated._km_vergoeding
              setContractForm(p => ({ ...p, extra_prijzen: JSON.stringify(updated), totaalprijs: recalc(p.basisprijs, updated) }))
            }

            const kmGratis = parseFloat(extraPrijzen._km_gratis || '20') || 0
            const kmAfstand = parseFloat(extraPrijzen._km_afstand || '0') || 0
            const kmRitten = parseFloat(extraPrijzen._km_ritten || '2') || 0
            const kmPrijs = parseFloat(extraPrijzen._km_prijs || '0') || 0

            return (
              <div className="mb-4 space-y-3">
                {/* Basisprijs + Korting rij */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                    <label className="text-xs font-bold text-[#007AFF] uppercase tracking-wider">Basisprijs</label>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-gray-400 text-sm">€</span>
                      <input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={contractForm.basisprijs}
                        onChange={e => updateBasis(e.target.value)}
                        className="flex-1 bg-white border border-blue-200 text-gray-900 rounded-xl px-2 py-2 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all"
                      />
                    </div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                    <label className="text-xs font-bold text-green-700 uppercase tracking-wider">Korting</label>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-gray-400 text-sm">- €</span>
                      <input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={extraPrijzen['_korting'] || ''}
                        onChange={e => updateKorting(e.target.value)}
                        className="flex-1 bg-white border border-green-200 text-gray-900 rounded-xl px-2 py-2 text-sm focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20 transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Extra's meerprijs */}
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Meerprijs per Extra</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Standaardprijzen worden automatisch ingevuld voor geselecteerde extra's</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {Object.entries(EXTRA_LABELS).map(([key, label]) => {
                      const isActive = booking[key as keyof typeof booking]
                      return (
                        <div key={key} className="flex items-center gap-3 px-3 py-2.5">
                          <span className="text-xs text-gray-700 flex-1">{label}</span>
                          {isActive
                            ? <span className="text-[10px] text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded">geselecteerd</span>
                            : <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">niet gekozen</span>
                          }
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400 text-xs">+ €</span>
                            <input
                              type="number" min="0" step="0.01" placeholder="0"
                              value={extraPrijzen[key] || ''}
                              onChange={e => updateExtraPreis(key, e.target.value)}
                              className="w-20 bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#007AFF] transition-all"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Kilometervergoeding */}
                <div className="border border-amber-200 bg-amber-50 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-amber-200">
                    <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Kilometervergoeding</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">Eerste 20 km gratis. Afstand = enkele rit; aantal ritten kan je verhogen bij extra opbouw/verplaatsingen.</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3">
                    <div><label className="text-[10px] font-bold text-amber-700 uppercase">Gratis km</label><input type="number" min="0" step="0.1" value={extraPrijzen._km_gratis || '20'} onChange={e => updateKm('_km_gratis', e.target.value)} className="mt-1 w-full bg-white border border-amber-200 rounded-lg px-2 py-1.5 text-xs" /></div>
                    <div><label className="text-[10px] font-bold text-amber-700 uppercase">Afstand enkele rit</label><input type="number" min="0" step="0.1" value={extraPrijzen._km_afstand || ''} onChange={e => updateKm('_km_afstand', e.target.value)} className="mt-1 w-full bg-white border border-amber-200 rounded-lg px-2 py-1.5 text-xs" placeholder="km" /></div>
                    <div><label className="text-[10px] font-bold text-amber-700 uppercase">Aantal ritten</label><input type="number" min="1" step="1" value={extraPrijzen._km_ritten || '2'} onChange={e => updateKm('_km_ritten', e.target.value)} className="mt-1 w-full bg-white border border-amber-200 rounded-lg px-2 py-1.5 text-xs" /></div>
                    <div><label className="text-[10px] font-bold text-amber-700 uppercase">Prijs/km</label><input type="number" min="0" step="0.01" value={extraPrijzen._km_prijs || ''} onChange={e => updateKm('_km_prijs', e.target.value)} className="mt-1 w-full bg-white border border-amber-200 rounded-lg px-2 py-1.5 text-xs" placeholder="0.00" /></div>
                  </div>
                  <div className="px-3 pb-3 text-xs font-semibold text-amber-900">
                    Berekend: {kmVergoedingVal > 0 ? `€ ${kmVergoedingVal.toFixed(2)} (${Math.max(0, kmAfstand - kmGratis).toFixed(1)} km × ${kmRitten} ritten × € ${kmPrijs.toFixed(2)})` : 'geen kilometervergoeding'}
                  </div>
                </div>

                {/* Totaal berekend */}
                <div className="bg-gray-900 rounded-xl px-4 py-3">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-xs text-gray-400">Totaalprijs (berekend)</p>
                      <p className="text-2xl font-bold text-white mt-0.5">€ {totaal.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Restbedrag na voorschot</p>
                      <p className="text-lg font-semibold text-[#34C759]">€ {Math.max(0, totaal - 100).toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-500 space-y-0.5 border-t border-gray-700 pt-2">
                    <div className="flex justify-between"><span>Basisprijs</span><span>€ {basisVal.toFixed(2)}</span></div>
                    {extrasTotal !== 0 && <div className="flex justify-between"><span>Extra's incl. km</span><span>+ € {extrasTotal.toFixed(2)}</span></div>}
                    {kortingVal > 0 && <div className="flex justify-between text-green-400"><span>Korting</span><span>- € {kortingVal.toFixed(2)}</span></div>}
                  </div>
                </div>

              </div>
            )
          })()}

          {/* Betalingsinstructies */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Betalingsinstructies (zichtbaar voor klant)</label>
            <div className="mt-1 w-full bg-gray-50 border border-gray-200 text-gray-700 rounded-xl px-3 py-2 text-sm">
              Voor de bevestiging van uw boeking vragen wij een vast voorschot van € 100,00. U krijgt hiervan binnenkort een Billit factuur via mail.
            </div>
          </div>

          {/* Billit Factuur upload + acties */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Factuur status */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium ${
              booking.has_billit_factuur_pdf || booking.billit_factuur_naam
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-gray-50 border-gray-200 text-gray-400'
            }`}>
              {booking.has_billit_factuur_pdf || booking.billit_factuur_naam
                ? <><CheckCircle2 size={14} /> {booking.billit_factuur_naam || 'Factuur geüpload'}</>
                : <><XCircle size={14} /> Geen factuur</>
              }
            </div>

            {/* Upload knop */}
            <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFactuurUpload} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={factuurUploading}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-900 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              <Upload size={14} /> {factuurUploading ? 'Uploaden...' : 'Billit PDF Uploaden'}
            </button>

            {/* Factuur bekijken */}
            {(booking.has_billit_factuur_pdf || booking.billit_factuur_naam) && (
              <button
                onClick={openFactuur}
                className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              >
                <ExternalLink size={14} /> Factuur Bekijken
              </button>
            )}

            <div className="flex-1" />

            {/* Opslaan */}
            <button
              onClick={saveContractInfo}
              disabled={contractSaving}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-900 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
            >
              <Save size={14} /> {contractSaving ? 'Opslaan...' : 'Opslaan'}
            </button>

            {/* Contract genereren — slechts 1x, vernieuwen met code 7777 */}
            {(booking.has_contract_pdf || booking.contract_pdf) ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-xl font-medium">
                  <CheckCircle2 size={13} /> Contract aangemaakt
                </span>
                {booking.contract_info_unlocked ? (
                  <button
                    onClick={closeContractInfoForCustomer}
                    className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl font-medium hover:bg-amber-100 transition-colors"
                  >
                    Contract Info sluiten
                  </button>
                ) : (
                  <button
                    onClick={openContractInfoForCustomer}
                    className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl font-medium hover:bg-amber-100 transition-colors"
                  >
                    Contract Info openzetten
                  </button>
                )}
                <button
                  onClick={async () => {
                    const naam = (booking.naam_organisator || 'boeking').replace(/[^a-z0-9]/gi, '-').toLowerCase()
                    const datum = booking.feest_datum || 'datum'
                    // Gebruik lokale copy indien zojuist gegenereerd, anders haal op via API
                    const pdfBase64 = booking.contract_pdf
                      || await import('../lib/api').then(m => m.getBookingPDF(String(booking.id), 'contract'))
                    if (!pdfBase64) { alert('Contract niet beschikbaar'); return }
                    const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))
                    const blob = new Blob([bytes], { type: 'application/pdf' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `contract-djkwinten-${naam}-${datum}.pdf`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    setTimeout(() => URL.revokeObjectURL(url), 10000)
                  }}
                  className="flex items-center gap-1.5 text-xs text-[#007AFF] bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl font-medium hover:bg-blue-100 transition-colors"
                >
                  <Download size={13} /> Downloaden
                </button>
                <button
                  onClick={async () => {
                    const code = prompt('Voer de code in om het contract te hernieuwen:')
                    if (code !== '7777') { if (code !== null) alert('Ongeldige code.'); return }
                    setContractGenerating(true)
                    try {
                      const contractBooking = { ...booking,
                        extra_prijzen: contractForm.extra_prijzen || booking.extra_prijzen,
                        basisprijs: contractForm.basisprijs ? parseFloat(contractForm.basisprijs) : booking.basisprijs,
                        totaalprijs: contractForm.totaalprijs ? parseFloat(contractForm.totaalprijs) : booking.totaalprijs,
                        adres_organisator: contractForm.adres_organisator || booking.adres_organisator,
                        voorschot_instructies: contractForm.voorschot_instructies || booking.voorschot_instructies
                      }
                      const pdfBase64 = await generateContractPDFBase64(contractBooking)
                      updateContractInfo(booking.id, { contract_pdf: pdfBase64 }).catch(console.error)
                      setBooking(prev => prev ? { ...prev, contract_pdf: pdfBase64 } : prev)
                      const naam = (contractBooking.naam_organisator || 'boeking').replace(/[^a-z0-9]/gi, '-').toLowerCase()
                      const datum = contractBooking.feest_datum || 'datum'
                      const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))
                      const blob = new Blob([bytes], { type: 'application/pdf' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `contract-djkwinten-${naam}-${datum}.pdf`
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                      setTimeout(() => URL.revokeObjectURL(url), 10000)
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err)
                      alert('Contract genereren mislukt:\n' + msg)
                    } finally {
                      setContractGenerating(false)
                    }
                  }}
                  disabled={contractGenerating}
                  className="flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 px-3 py-2 rounded-xl font-medium hover:bg-orange-100 transition-colors disabled:opacity-60"
                >
                  <RefreshCw size={13} /> {contractGenerating ? '...' : 'Hernieuwen'}
                </button>
              </div>
            ) : (
              <button
                disabled={contractGenerating}
                onClick={async () => {
                  setContractGenerating(true)
                  try {
                    const contractBooking = { ...booking,
                      extra_prijzen: contractForm.extra_prijzen || booking.extra_prijzen,
                      basisprijs: contractForm.basisprijs ? parseFloat(contractForm.basisprijs) : booking.basisprijs,
                      totaalprijs: contractForm.totaalprijs ? parseFloat(contractForm.totaalprijs) : booking.totaalprijs,
                      adres_organisator: contractForm.adres_organisator || booking.adres_organisator,
                      voorschot_instructies: contractForm.voorschot_instructies || booking.voorschot_instructies
                    }
                    const pdfBase64 = await generateContractPDFBase64(contractBooking)
                    updateContractInfo(booking.id, { contract_pdf: pdfBase64 }).catch(console.error)
                    setBooking(prev => prev ? { ...prev, contract_pdf: pdfBase64 } : prev)
                    const naam = (contractBooking.naam_organisator || 'boeking').replace(/[^a-z0-9]/gi, '-').toLowerCase()
                    const datum = contractBooking.feest_datum || 'datum'
                    const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))
                    const blob = new Blob([bytes], { type: 'application/pdf' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `contract-djkwinten-${naam}-${datum}.pdf`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    setTimeout(() => URL.revokeObjectURL(url), 10000)
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err)
                    console.error('Contract generatie mislukt:', err)
                    alert('Contract genereren mislukt:\n' + msg)
                  } finally {
                    setContractGenerating(false)
                  }
                }}
                className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] disabled:opacity-60 text-white px-3 py-2 rounded-xl text-sm font-semibold transition-colors"
              >
                <Download size={14} /> {contractGenerating ? 'Genereren...' : 'Contract Genereren'}
              </button>
            )}
          </div>
        </div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Contact */}
          <Section title="Contact" icon={<Phone size={15} />}>
            <dl className="grid grid-cols-1 gap-3">
              {(booking.naam_partner1 || booking.naam_partner2) && (
                <div className="bg-pink-50 border border-pink-100 rounded-xl p-2.5 space-y-1">
                  <dt className="text-[10px] text-pink-500 font-bold uppercase tracking-wider">💍 Koppel</dt>
                  {booking.naam_partner1 && <dd className="text-sm text-gray-900 font-medium">{booking.naam_partner1}</dd>}
                  {booking.naam_partner2 && <dd className="text-sm text-gray-900 font-medium">{booking.naam_partner2}</dd>}
                </div>
              )}
              <Field label="Contactpersoon" value={booking.naam_organisator} />
              {booking.bedrijfsnaam && <Field label="Bedrijfsnaam" value={booking.bedrijfsnaam} />}
              <Field label="E-mail" value={booking.email} />
              <Field label="Telefoon" value={booking.telefoon} />
              <Field label="📍 Adres Organisator" value={booking.adres_organisator} />
              <Field label="Aantal Gasten" value={booking.aantal_gasten ? `${booking.aantal_gasten} personen` : undefined} />
              <Field label="Thema" value={booking.thema} />
              {(booking.backup_contact_naam || booking.backup_contact_telefoon) && (
                <div className="pt-1 border-t border-gray-100">
                  <dt className="text-xs text-gray-400 uppercase tracking-wider mb-1">📞 Back-up Contact (avond)</dt>
                  <dd className="text-sm text-gray-900">{booking.backup_contact_naam}</dd>
                  {booking.backup_contact_telefoon && (
                    <dd className="text-sm text-gray-500">{booking.backup_contact_telefoon}</dd>
                  )}
                </div>
              )}
            </dl>
          </Section>

          {/* Planning */}
          <Section title="Planning" icon={<Clock size={15} />}>
            <div className="space-y-2">
              {[
                { label: 'Ceremonie', value: booking.uur_ceremonie },
                { label: 'Receptie', value: booking.uur_receptie },
                { label: 'Diner', value: booking.uur_diner },
                { label: 'Dessert', value: booking.uur_dessert },
                { label: 'Dansfeest', value: booking.uur_dansfeest },
                { label: 'Midnight Snack', value: booking.uur_midnightsnack },
                { label: 'Einduur', value: booking.einduur },
              ].filter(x => x.value).map(x => (
                <div key={x.label} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-500">{x.label}</span>
                  <span className="font-mono text-gray-900 font-medium">{x.value}</span>
                </div>
              ))}
              {!booking.uur_receptie && !booking.uur_diner && (
                <p className="text-sm text-gray-400 italic">Nog niet ingevuld door klant</p>
              )}
            </div>
          </Section>

          {/* Muziek */}
          <Section title="Muziek" icon={<Music2 size={15} />}>
            <dl className="grid grid-cols-1 gap-3">
              <Field label="Top Genres" value={booking.top_genres} />
              <Field label="Flop Genres" value={booking.flop_genres} />
              <Field label="Must Play" value={booking.must_play} />
              <Field label="Do Not Play" value={booking.do_not_play} />
              {booking.spotify_link && (
                <div>
                  <dt className="text-xs text-gray-400 uppercase tracking-wider">Spotify</dt>
                  <dd className="mt-0.5">
                    <a href={booking.spotify_link} target="_blank" rel="noopener noreferrer"
                      className="text-green-600 hover:text-green-700 text-sm underline break-all">
                      {booking.spotify_link}
                    </a>
                  </dd>
                </div>
              )}
              <Field label="Muziek Diner" value={booking.muziek_diner} />
              {booking.verzoeknummers && (
                <div>
                  <dt className="text-xs text-gray-400 uppercase tracking-wider">Verzoeknummers</dt>
                  <dd className={`text-sm mt-0.5 font-medium ${
                    booking.verzoeknummers === 'Ja' ? 'text-green-600' :
                    booking.verzoeknummers === 'Nee' ? 'text-red-500' : 'text-amber-500'
                  }`}>🎤 {booking.verzoeknummers}</dd>
                </div>
              )}
              {isTrouw && <>
                <Field label="Intrede Zaal" value={booking.intrede_zaal_nummer} />
                <Field label="Intrede Taart" value={booking.intrede_taart_nummer} />
                <Field label="Openingsdans" value={booking.openingsdans_nummer} />
                <Field label="Tweede Dans" value={parseTweedeDans(booking.tweede_dans_nummer)} />
                <Field label="Boeket Werpen" value={booking.boeket_werpen_nummer} />
              </>}
              {booking.verjaardag_naam_leeftijd && (
                <Field label="Verjaardag" value={booking.verjaardag_naam_leeftijd} />
              )}
            </dl>
          </Section>

          {/* Voorzieningen */}
          <Section title="Zaal" icon={<Speaker size={15} />}>
            <dl className="grid grid-cols-1 gap-3 mb-4">
              <Field label="Naam Zaal" value={booking.locatie_naam} />
              <Field label="📍 Adres Zaal" value={booking.locatie_adres} />
              <Field label="Zaal Contact" value={booking.zaal_contact} />
              <Field label="Leveranciers / partners" value={formatLeveranciers(booking.leveranciers_info)} />
              <Field label="Geluidsbeperking" value={booking.geluidsbeperking_info} />
              <Field label="Wifi Code" value={booking.wifi_code} mono />
              <Field label="🚗 Parkeren / Laden" value={booking.parkeren_info} />
              {booking.gelijkvloers !== undefined && booking.gelijkvloers !== null && (
                <div>
                  <dt className="text-xs text-gray-400 uppercase tracking-wider">Toegankelijkheid</dt>
                  <dd className="text-sm text-gray-900 mt-0.5">
                    {booking.gelijkvloers ? '🏠 Gelijkvloers' : '🏢 Verdieping / Lift'}
                  </dd>
                </div>
              )}
            </dl>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Voorziet de DJ</p>
            <div className="grid grid-cols-2 gap-2">
              <BoolField label="Muziekinstallatie" value={booking.speakers_aanwezig} icon={<Speaker size={12} />} />
              <BoolField label="Lichtshow" value={booking.licht_aanwezig} icon={<Lightbulb size={12} />} />
              <BoolField label="Microfoon" value={booking.micro_aanwezig} icon={<Mic size={12} />} />
              <BoolField label="DJ-BOOTH / DJ-TAFEL" value={booking.dj_booth_aanwezig} icon={<Music2 size={12} />} />
              <BoolField label="Uplights" value={booking.uplights_aanwezig} icon={<Zap size={12} />} />
            </div>
          </Section>

            {/* Extra's */}
          <Section title="Extra's" icon={<Star size={15} />}>
            <div className="grid grid-cols-2 gap-2">
              <BoolField label="Ceremonie Set" value={booking.ceremonie_set} icon={<Heart size={12} />} />
              <BoolField label="Digitale Photobooth" value={booking.digital_booth} icon={<Star size={12} />} />
              <BoolField label="Photobooth met Prints" value={booking.retro_booth} icon={<Star size={12} />} />
              <BoolField label="Extra Luidspreker voor Receptie" value={booking.draadloze_speaker} icon={<Volume2 size={12} />} />
              <BoolField label="Karaoke" value={booking.karaoke} icon={<Mic size={12} />} />
            </div>
          </Section>
        </div>

        {/* Klant feedback */}
        {(booking.feedback_vragenlijst || booking.feedback_herkomst) && (
          <Section title="Feedback klant" icon={<span>💬</span>}>
            <div className="space-y-3">
              {booking.feedback_vragenlijst && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Hoe vond de klant de vragenlijst?</p>
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    {booking.feedback_vragenlijst}
                  </span>
                </div>
              )}
              {booking.feedback_herkomst && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Hoe gevonden?</p>
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-purple-50 text-purple-700 border border-purple-200">
                    {booking.feedback_herkomst}
                  </span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Zaalfoto's */}
        {(() => {
          const API_ROOT = import.meta.env.VITE_API_URL || ''
          type ZaalFoto = { naam: string; type: string; key: string; category?: string }
          let fotos: ZaalFoto[] = []
          try {
            const parsed = booking.zaal_fotos ? JSON.parse(booking.zaal_fotos) : []
            fotos = Array.isArray(parsed)
              ? parsed.filter((f): f is ZaalFoto => !!f && typeof f.naam === 'string' && typeof f.type === 'string' && typeof f.key === 'string' && f.category !== 'uitnodiging')
              : []
          } catch {}
          if (fotos.length === 0) return null
          return (
            <Section title="Zaalfoto's & Plattegrond" icon={<span>📸</span>}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {fotos.map((f, i) => (
                  <a
                    key={i}
                    href={`${API_ROOT}/api/uploads/${f.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-2 bg-gray-50 border border-gray-200 hover:border-[#007AFF] rounded-xl p-3 transition-colors group"
                  >
                    <span className="text-3xl">{f.type.startsWith('image/') ? '🖼️' : '📄'}</span>
                    <span className="text-xs text-gray-600 group-hover:text-[#007AFF] text-center truncate w-full transition-colors">{f.naam}</span>
                    <span className="text-[10px] text-[#007AFF] font-medium">Openen →</span>
                  </a>
                ))}
              </div>
            </Section>
          )
        })()}
        </>)}
      </main>
    </div>
    {showVragenlijstModal && booking && (
      <VragenlijstOverzichtModal booking={booking} onClose={() => setShowVragenlijstModal(false)} />
    )}
    </>
  )
}
