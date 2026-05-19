import { useEffect, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { BookingContractInfo } from '../types'
import { saveContractInfo, suggestVenues } from '../../../lib/api'
import { AutosaveIndicator } from './AutosaveIndicator'


const EXTRA_OPTIONS = [
  { key: 'ceremonie_set', label: 'Ceremonie set', link: 'https://djkwinten.be/formules/ceremonie', description: 'Ceremonie met aparte set-up voor muziek en microfoon.' },
  { key: 'digital_booth', label: 'Digitale Photobooth', link: 'https://djkwinten.be/formules/photobooth', description: 'Digitale photobooth zonder prints, ideaal om foto’s digitaal te delen.' },
  { key: 'retro_booth', label: 'Luxe Photobooth met prints', link: 'https://djkwinten.be/formules/photobooth', description: 'Luxe photobooth inclusief prints voor gasten.' },
  { key: 'draadloze_speaker', label: 'Draadloze speaker', link: '', description: 'Extra draadloze speaker voor receptie, ceremonie of aparte ruimte.' },
  { key: 'karaoke', label: 'Karaoke', link: 'https://djkwinten.be/formules/karaoke', description: 'Karaokeformule als extra animatie tijdens het feest.' },
] as const

type ExtraKey = typeof EXTRA_OPTIONS[number]['key']

function parseExtraPrices(value?: string | null): Record<string, number> {
  try { return JSON.parse(value || '{}') as Record<string, number> } catch { return {} }
}

export function ContractInfoForm({
  bookingId,
  initial,
  showFinancial = true,
  readOnly = false,
  onChange,
  requireCompleteBeforeSave = false,
  saveLabel = 'Opslaan',
  onSaved,
  notifyOnComplete = false,
  enableAutosave = true,
}: {
  bookingId: number
  initial: BookingContractInfo
  showFinancial?: boolean
  readOnly?: boolean
  onChange?: (info: BookingContractInfo) => void
  requireCompleteBeforeSave?: boolean
  saveLabel?: string
  onSaved?: (info: BookingContractInfo) => void
  notifyOnComplete?: boolean
  enableAutosave?: boolean
}) {
  const withDefaultTech = (info: BookingContractInfo): BookingContractInfo => ({
    ...info,
    geluid_voorzien: 1,
    licht_voorzien: 1,
    dj_booth_nodig: 1,
  })
  const [form, setForm] = useState<BookingContractInfo>(() => withDefaultTech(initial))
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const didMount = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setForm(withDefaultTech(initial)); didMount.current = false }, [initial])

  const update = <K extends keyof BookingContractInfo>(key: K, value: BookingContractInfo[K]) => {
    if (readOnly) return
    setForm(p => {
      const next = { ...p, [key]: value }
      onChange?.(next)
      return next
    })
  }

  const requiredComplete = !!(
    form.naam?.trim() &&
    form.email?.trim() &&
    form.gsm?.trim() &&
    form.klant_adres?.trim() &&
    form.event_type?.trim() &&
    form.event_datum?.trim() &&
    form.locatie_naam?.trim() &&
    form.locatie_adres?.trim()
  )

  const save = async (current = form) => {
    if (readOnly) return
    if (requireCompleteBeforeSave && !requiredComplete) {
      setStatus('error')
      return
    }
    setStatus('saving')
    const payload = notifyOnComplete
      ? ({ ...current, _notify_contract_complete: 1 } as Partial<BookingContractInfo> & { _notify_contract_complete: number })
      : current
    const res = await saveContractInfo(bookingId, payload)
    setStatus(res.success ? 'saved' : 'error')
    if (res.success) onSaved?.(current)
  }

  useEffect(() => {
    if (readOnly || !enableAutosave) return
    if (!didMount.current) { didMount.current = true; return }
    if (requireCompleteBeforeSave && !requiredComplete) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(form), 750)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [form, readOnly, enableAutosave, requireCompleteBeforeSave, requiredComplete, notifyOnComplete]) // eslint-disable-line react-hooks/exhaustive-deps

  const input = `mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`
  const label = 'text-xs font-medium text-gray-500 uppercase tracking-wider'

  const extraPrices = parseExtraPrices(form.extra_prijzen)
  const kmGratis = Number(extraPrices._km_gratis ?? 20)
  const kmAfstand = Number(extraPrices._km_afstand ?? 0)
  const kmRitten = Number(extraPrices._km_ritten ?? 2)
  const kmPrijs = Number(extraPrices._km_prijs ?? 0)
  const kmVergoeding = Math.max(0, kmAfstand - kmGratis) * kmRitten * kmPrijs

  const updateExtraPrices = (next: Record<string, number>) => update('extra_prijzen', JSON.stringify(next))

  const updateKm = (key: '_km_gratis' | '_km_afstand' | '_km_ritten' | '_km_prijs', value: string) => {
    const next = { ...parseExtraPrices(form.extra_prijzen) }
    if (value === '') delete next[key]
    else next[key] = Number(value)
    const gratis = Number(next._km_gratis ?? 20)
    const afstand = Number(next._km_afstand ?? 0)
    const ritten = Number(next._km_ritten ?? 2)
    const prijs = Number(next._km_prijs ?? 0)
    const vergoeding = Math.max(0, afstand - gratis) * ritten * prijs
    if (vergoeding > 0) next._km_vergoeding = Number(vergoeding.toFixed(2))
    else delete next._km_vergoeding
    updateExtraPrices(next)
  }

  const updateExtraPrice = (key: ExtraKey, value: string) => {
    const next = { ...parseExtraPrices(form.extra_prijzen) }
    if (value === '') delete next[key]
    else next[key] = Number(value)
    updateExtraPrices(next)
  }

  const handleVenueBlur = async () => {
    if (readOnly || form.locatie_adres?.trim() || !form.locatie_naam?.trim()) return
    try {
      const venues = await suggestVenues(form.locatie_naam)
      const exact = venues.find(v => v.naam.toLowerCase() === form.locatie_naam.toLowerCase())
      const match = exact || venues[0]
      if (match?.adres) update('locatie_adres', match.adres)
    } catch { /* geen automatische zaal gevonden */ }
  }

  const Toggle = ({ value, onChange, children }: { value: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
    <button
      type="button"
      disabled={readOnly}
      onClick={() => onChange(!value)}
      className={`flex items-center justify-between gap-2 p-3 rounded-xl border text-sm font-semibold transition-colors ${
        value ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'
      } ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
    >
      <span>{children}</span>
      <span className={`px-2 py-0.5 rounded-full text-xs ${value ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
        {value ? 'JA' : 'NEE'}
      </span>
    </button>
  )

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900">Contract Info</h2>
          <p className="text-xs text-gray-400 mt-0.5">Korte verplichte info voor contract, voorschotfactuur en event-samenvatting.</p>
          {requireCompleteBeforeSave && !requiredComplete && !readOnly && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-2">
              Vul alle velden met * in. Daarna kan je opslaan en verdergaan naar de vragenlijst.
            </p>
          )}
          {readOnly && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-2">
              Contract is aangemaakt — deze gegevens zijn nu vergrendeld.
            </p>
          )}
        </div>
        <AutosaveIndicator status={status} />
      </div>

      <section className="space-y-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Contact</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><label className={label}>Naam *</label><input value={form.naam || ''} onChange={e => update('naam', e.target.value)} className={input} disabled={readOnly} /></div>
          <div><label className={label}>Email *</label><input type="email" value={form.email || ''} onChange={e => update('email', e.target.value)} className={input} disabled={readOnly} /></div>
          <div><label className={label}>GSM *</label><input type="tel" value={form.gsm || ''} onChange={e => update('gsm', e.target.value)} className={input} disabled={readOnly} /></div>
        </div>
        <div><label className={label}>Adres klant/opdrachtgever *</label><input value={form.klant_adres || ''} onChange={e => update('klant_adres', e.target.value)} className={input} disabled={readOnly} placeholder="Straat nr, postcode gemeente" /></div>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Event</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label}>Event type *</label><input value={form.event_type || ''} onChange={e => update('event_type', e.target.value)} className={input} disabled={readOnly} /></div>
          <div><label className={label}>Datum *</label><input type="date" value={form.event_datum || ''} onChange={e => update('event_datum', e.target.value)} className={input} disabled={readOnly} /></div>
          <div><label className={label}>Locatie naam *</label><input value={form.locatie_naam || ''} onChange={e => update('locatie_naam', e.target.value)} onBlur={handleVenueBlur} className={input} disabled={readOnly} placeholder="Typ een gekende zaalnaam" /></div>
          <div><label className={label}>Locatie adres *</label><input value={form.locatie_adres || ''} onChange={e => update('locatie_adres', e.target.value)} className={input} disabled={readOnly} placeholder="Wordt automatisch ingevuld bij gekende zaal" /></div>
          <div><label className={label}>Aantal gasten</label><input type="number" min="0" value={form.aantal_gasten ?? ''} onChange={e => update('aantal_gasten', e.target.value === '' ? null : Number(e.target.value))} className={input} disabled={readOnly} placeholder="Bijv. 150" /></div>
          <div><label className={label}>Gewenste start dansfeest</label><input type="time" value={form.uur_dansfeest || ''} onChange={e => update('uur_dansfeest', e.target.value)} className={input} disabled={readOnly} /></div>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Technisch — kies duidelijk ja of nee</p>
        <div className="grid sm:grid-cols-3 gap-2">
          <Toggle value={!!form.geluid_voorzien} onChange={v => update('geluid_voorzien', v ? 1 : 0)}>DJ Kwinten zorgt voor geluidsinstallatie</Toggle>
          <Toggle value={!!form.licht_voorzien} onChange={v => update('licht_voorzien', v ? 1 : 0)}>DJ Kwinten zorgt voor lichtinstallatie</Toggle>
          <Toggle value={!!form.dj_booth_nodig} onChange={v => update('dj_booth_nodig', v ? 1 : 0)}>DJ Kwinten zorgt voor DJ-booth</Toggle>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Extra's</p>
        <p className="text-xs text-gray-400">Kies hier eventuele extra opties. Deze worden opgeslagen op de boeking en meegenomen in de overeenkomst.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {EXTRA_OPTIONS.map(extra => {
            const prijs = extraPrices[extra.key]
            return (
              <div key={extra.key} className="space-y-2 rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <Toggle value={!!form[extra.key]} onChange={v => update(extra.key, v ? 1 : 0)}>
                  <span className="flex flex-col items-start text-left">
                    <span>{extra.label}{prijs !== undefined ? ` · € ${Number(prijs).toFixed(2).replace('.', ',')}` : ''}</span>
                    <span className="text-[11px] font-normal opacity-75 mt-0.5">{extra.description}</span>
                  </span>
                </Toggle>
                {extra.link && (
                  <a href={extra.link} target="_blank" rel="noopener noreferrer" className="inline-flex text-xs font-semibold text-[#007AFF] hover:underline">
                    Meer info over {extra.label}
                  </a>
                )}
                {showFinancial && !!form[extra.key] && (
                  <div>
                    <label className={label}>Prijs {extra.label}</label>
                    <input type="number" min="0" step="0.01" value={extraPrices[extra.key] ?? ''} onChange={e => updateExtraPrice(extra.key, e.target.value)} className={input} disabled={readOnly} placeholder="0.00" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {showFinancial && (
        <section className="space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Financieel</p>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 space-y-3">
            <div>
              <p className="text-sm font-bold text-amber-800">Kilometervergoeding</p>
              <p className="text-xs text-amber-700 mt-0.5">Voorstel: eerste 20 km gratis. Vul afstand enkele rit, aantal ritten en €/km in. De vergoeding wordt automatisch als extra kost meegenomen.</p>
            </div>
            <div className="grid sm:grid-cols-4 gap-3">
              <div><label className={label}>Gratis km</label><input type="number" min="0" step="0.1" value={extraPrices._km_gratis ?? 20} onChange={e => updateKm('_km_gratis', e.target.value)} className={input} disabled={readOnly} /></div>
              <div><label className={label}>Afstand enkele rit</label><input type="number" min="0" step="0.1" value={extraPrices._km_afstand ?? ''} onChange={e => updateKm('_km_afstand', e.target.value)} className={input} disabled={readOnly} placeholder="km" /></div>
              <div><label className={label}>Aantal ritten</label><input type="number" min="1" step="1" value={extraPrices._km_ritten ?? 2} onChange={e => updateKm('_km_ritten', e.target.value)} className={input} disabled={readOnly} /></div>
              <div><label className={label}>Prijs per km</label><input type="number" min="0" step="0.01" value={extraPrices._km_prijs ?? ''} onChange={e => updateKm('_km_prijs', e.target.value)} className={input} disabled={readOnly} placeholder="0.00" /></div>
            </div>
            <div className="text-sm font-semibold text-amber-900 bg-white/70 border border-amber-100 rounded-xl px-3 py-2">
              Berekend: {kmAfstand > kmGratis && kmPrijs > 0 ? `${(kmAfstand - kmGratis).toFixed(1).replace('.', ',')} km betalend × ${kmRitten} ritten × € ${kmPrijs.toFixed(2).replace('.', ',')} = € ${kmVergoeding.toFixed(2).replace('.', ',')}` : 'geen kilometervergoeding'}
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div><label className={label}>Basisprijs</label><input type="number" min="0" step="0.01" value={form.basisprijs ?? form.afgesproken_prijs ?? ''} onChange={e => { const v = e.target.value === '' ? null : Number(e.target.value); update('basisprijs', v); update('afgesproken_prijs', v) }} className={input} disabled={readOnly} /></div>
            <div><label className={label}>Afgesproken totaal/prijs</label><input type="number" min="0" step="0.01" value={form.afgesproken_prijs ?? ''} onChange={e => update('afgesproken_prijs', e.target.value === '' ? null : Number(e.target.value))} className={input} disabled={readOnly} /></div>
            <div><label className={label}>Voorschot bedrag</label><input type="number" min="0" step="0.01" value={form.voorschot_bedrag ?? ''} onChange={e => update('voorschot_bedrag', e.target.value === '' ? null : Number(e.target.value))} className={input} disabled={readOnly} /></div>
          </div>
        </section>
      )}

      {!readOnly && (
        <div className="flex justify-end pt-1">
          <button
            onClick={() => save()}
            disabled={requireCompleteBeforeSave && !requiredComplete}
            title={requireCompleteBeforeSave && !requiredComplete ? 'Vul eerst alle verplichte velden in' : ''}
            className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <Save size={14} /> {saveLabel}
          </button>
        </div>
      )}
    </div>
  )
}
