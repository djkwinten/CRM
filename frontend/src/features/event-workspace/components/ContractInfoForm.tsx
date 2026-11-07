import { useEffect, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { BookingContractInfo } from '../types'
import { saveContractInfo, suggestVenues } from '../../../lib/api'
import { calculateBookingPricing } from '../../../lib/bookingPricing'
import { WEDDING_FORMULAS, WEDDING_FORMULA_EXTRA_KEY, getWeddingFormula, parseExtraPrices, stringifyExtraPrices } from '../../../config/weddingFormulas'
import { AutosaveIndicator } from './AutosaveIndicator'

export function ContractInfoForm({
  bookingId,
  initial,
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
  readOnly?: boolean
  onChange?: (info: BookingContractInfo) => void
  requireCompleteBeforeSave?: boolean
  saveLabel?: string
  onSaved?: (info: BookingContractInfo) => void
  notifyOnComplete?: boolean
  enableAutosave?: boolean
}) {
  const withDefaultTech = (info: BookingContractInfo): BookingContractInfo => {
    const extraPrices = parseExtraPrices(info.extra_prijzen)
    if (info.event_type !== 'Trouw' && extraPrices._aanwezig_vanaf_receptie === undefined) {
      extraPrices._aanwezig_vanaf_receptie = '0'
    }
    return ({
    ...info,
    extra_prijzen: stringifyExtraPrices(extraPrices),
    // Alleen standaard op JA zetten als er helemaal geen waarde bestaat.
    // Een expliciete 0 uit de boeking betekent: bewust uitgevinkt, dus behouden.
    // Standaard JA alleen wanneer er nog geen keuze is opgeslagen.
    // Een expliciete 0 (NEE) blijft dus behouden, ook vóór de eerste opslag.
    geluid_voorzien: info.geluid_voorzien ?? 1,
    licht_voorzien: info.licht_voorzien ?? 1,
    dj_booth_nodig: info.dj_booth_nodig ?? 1,
  })
  }
  const [form, setForm] = useState<BookingContractInfo>(() => withDefaultTech(initial))
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
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
    form.locatie_adres?.trim() &&
    (form.event_type !== 'Trouw' || !!getWeddingFormula(parseExtraPrices(form.extra_prijzen)[WEDDING_FORMULA_EXTRA_KEY]))
  )

  const save = async (current = form) => {
    if (readOnly) return
    if (requireCompleteBeforeSave && !requiredComplete) {
      setSaveError('Vul eerst alle verplichte velden (*) in. Controleer vooral e-mailadres, klantadres en zaaladres.')
      setStatus('error')
      return
    }
    setSaveError('')
    setStatus('saving')
    const extraPrices = parseExtraPrices(current.extra_prijzen)
    const isWedding = current.event_type === 'Trouw'
    const formula = isWedding ? getWeddingFormula(extraPrices[WEDDING_FORMULA_EXTRA_KEY]) : null
    const basisprijs = formula?.price ?? Number(current.basisprijs || 0)
    const pricingExtraPrices = stringifyExtraPrices(extraPrices)
    const totaalprijs = calculateBookingPricing({
      type_feest: current.event_type,
      basisprijs,
      extra_prijzen: pricingExtraPrices,
    }).totaalprijs

    // Bewaar contractinfo én prijs in één serverrequest. Zo kan een tweede,
    // afzonderlijke prijsupdate de succesvolle opslag niet achteraf doen mislukken.
    const payload = {
      ...current,
      basisprijs,
      extra_prijzen: pricingExtraPrices,
      contract_ready: 1,
      ...(notifyOnComplete ? { _notify_contract_complete: 1 } : {}),
    } as Partial<BookingContractInfo> & { contract_ready: number; _notify_contract_complete?: number }
    try {
      const res = await saveContractInfo(bookingId, payload)
      if (res.success) {
        setSaveError('')
        onSaved?.({ ...current, basisprijs, extra_prijzen: pricingExtraPrices, afgesproken_prijs: totaalprijs })
        setStatus('saved')
      } else {
        const message = res.error || 'De server heeft de opslag geweigerd.'
        console.error('[ContractInfoForm] Contract Info opslaan mislukt:', message)
        setSaveError(message)
        setStatus('error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Onbekende fout tijdens het opslaan.'
      console.error('[ContractInfoForm] Onverwachte opslagfout:', error)
      setSaveError(message)
      setStatus('error')
    }
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
        <div className="flex flex-col items-end gap-1">
          <AutosaveIndicator status={status} />
          {status === 'error' && saveError && <p role="alert" className="max-w-xs text-right text-xs text-red-600">{saveError}</p>}
        </div>
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
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Formule / aanwezigheid</p>
        {form.event_type === 'Trouw' ? (() => {
          const selected = getWeddingFormula(parseExtraPrices(form.extra_prijzen)[WEDDING_FORMULA_EXTRA_KEY])
          const selectFormula = (key: string) => {
            const prices = parseExtraPrices(form.extra_prijzen)
            prices[WEDDING_FORMULA_EXTRA_KEY] = key
            delete prices.ceremonie_set
            update('extra_prijzen', stringifyExtraPrices(prices))
          }
          return (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {WEDDING_FORMULAS.map((formula, index) => (
                <button key={formula.key} type="button" disabled={readOnly} onClick={() => selectFormula(formula.key)}
                  className={`text-left rounded-xl border p-3 transition-all ${selected?.key === formula.key ? 'bg-pink-50 border-pink-400 ring-2 ring-pink-100' : 'bg-white border-gray-200 hover:border-pink-200'} ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}>
                  <span className="text-lg">{formula.emoji}</span>
                  <span className="block text-sm font-bold text-gray-900 mt-1">{formula.label}</span>
                  <span className="block text-xs font-semibold text-pink-700 mt-1">+ € {[0, 100, 350][index]},00</span>
                </button>
              ))}
            </div>
          )
        })() : (() => {
          const prices = parseExtraPrices(form.extra_prijzen)
          const selectedReception = prices._aanwezig_vanaf_receptie === '1'
          const selectPresence = (value: boolean) => {
            const next = { ...prices, _aanwezig_vanaf_receptie: value ? '1' : '0' }
            update('extra_prijzen', stringifyExtraPrices(next))
          }
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" disabled={readOnly} onClick={() => selectPresence(false)}
                className={`text-left rounded-xl border p-3 ${!selectedReception ? 'bg-green-50 border-green-300 ring-2 ring-green-100' : 'bg-white border-gray-200'}`}>
                <span className="block text-sm font-bold text-gray-900">Vanaf het avondfeest</span>
                <span className="block text-xs font-semibold text-green-700 mt-1">+ € 0,00</span>
              </button>
              <button type="button" disabled={readOnly} onClick={() => selectPresence(true)}
                className={`text-left rounded-xl border p-3 ${selectedReception ? 'bg-green-50 border-green-300 ring-2 ring-green-100' : 'bg-white border-gray-200'}`}>
                <span className="block text-sm font-bold text-gray-900">Vanaf de receptie</span>
                <span className="block text-xs font-semibold text-green-700 mt-1">+ € 75,00</span>
              </button>
            </div>
          )
        })()}
      </section>

      <section className="space-y-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Technisch — kies duidelijk ja of nee</p>
        <div className="grid sm:grid-cols-3 gap-2">
          <Toggle value={!!form.geluid_voorzien} onChange={v => update('geluid_voorzien', v ? 1 : 0)}>DJ Kwinten zorgt voor geluidsinstallatie</Toggle>
          <Toggle value={!!form.licht_voorzien} onChange={v => update('licht_voorzien', v ? 1 : 0)}>DJ Kwinten zorgt voor lichtinstallatie</Toggle>
          <Toggle value={!!form.dj_booth_nodig} onChange={v => update('dj_booth_nodig', v ? 1 : 0)}>DJ Kwinten zorgt voor DJ-booth</Toggle>
        </div>
      </section>

      {!readOnly && (
        <div className="flex justify-end pt-1">
          <button
            onClick={() => save()}
            disabled={status === 'saving' || (requireCompleteBeforeSave && !requiredComplete)}
            title={requireCompleteBeforeSave && !requiredComplete ? 'Vul eerst alle verplichte velden in' : ''}
            className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <Save size={14} /> {saveLabel}
          </button>
        </div>
      )}
    </div>
  )
}
