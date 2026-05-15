import { useEffect, useRef, useState } from 'react'
import { Save } from 'lucide-react'
import { BookingContractInfo } from '../types'
import { saveContractInfo } from '../../../lib/api'
import { AutosaveIndicator } from './AutosaveIndicator'


const EXTRA_OPTIONS = [
  { key: 'ceremonie_set', label: 'Ceremonie set' },
  { key: 'digital_booth', label: 'Digital booth' },
  { key: 'retro_booth', label: 'Retro booth met prints' },
  { key: 'draadloze_speaker', label: 'Draadloze speaker' },
  { key: 'karaoke', label: 'Karaoke' },
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
}: {
  bookingId: number
  initial: BookingContractInfo
  showFinancial?: boolean
  readOnly?: boolean
  onChange?: (info: BookingContractInfo) => void
}) {
  const [form, setForm] = useState<BookingContractInfo>(initial)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const didMount = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setForm(initial); didMount.current = false }, [initial])

  const update = <K extends keyof BookingContractInfo>(key: K, value: BookingContractInfo[K]) => {
    if (readOnly) return
    setForm(p => {
      const next = { ...p, [key]: value }
      onChange?.(next)
      return next
    })
  }

  const save = async (current = form) => {
    if (readOnly) return
    setStatus('saving')
    const res = await saveContractInfo(bookingId, current)
    setStatus(res.success ? 'saved' : 'error')
  }

  useEffect(() => {
    if (readOnly) return
    if (!didMount.current) { didMount.current = true; return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(form), 750)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [form, readOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  const input = `mt-1 w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-all ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`
  const label = 'text-xs font-medium text-gray-500 uppercase tracking-wider'

  const extraPrices = parseExtraPrices(form.extra_prijzen)

  const updateExtraPrice = (key: ExtraKey, value: string) => {
    const next = { ...parseExtraPrices(form.extra_prijzen) }
    if (value === '') delete next[key]
    else next[key] = Number(value)
    update('extra_prijzen', JSON.stringify(next))
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
          <div><label className={label}>Locatie naam *</label><input value={form.locatie_naam || ''} onChange={e => update('locatie_naam', e.target.value)} className={input} disabled={readOnly} /></div>
          <div><label className={label}>Locatie adres *</label><input value={form.locatie_adres || ''} onChange={e => update('locatie_adres', e.target.value)} className={input} disabled={readOnly} /></div>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Technisch — kies duidelijk ja of nee</p>
        <div className="grid sm:grid-cols-3 gap-2">
          <Toggle value={!!form.geluid_voorzien} onChange={v => update('geluid_voorzien', v ? 1 : 0)}>Is er geluid/installatie voorzien door de zaal?</Toggle>
          <Toggle value={!!form.licht_voorzien} onChange={v => update('licht_voorzien', v ? 1 : 0)}>Is er lichtinstallatie voorzien door de zaal?</Toggle>
          <Toggle value={!!form.dj_booth_nodig} onChange={v => update('dj_booth_nodig', v ? 1 : 0)}>Moet DJ Kwinten een DJ booth meenemen?</Toggle>
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Extra's</p>
        <p className="text-xs text-gray-400">Kies hier eventuele extra opties. Deze worden opgeslagen op de boeking en meegenomen in de overeenkomst.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {EXTRA_OPTIONS.map(extra => (
            <div key={extra.key} className="space-y-2">
              <Toggle value={!!form[extra.key]} onChange={v => update(extra.key, v ? 1 : 0)}>{extra.label}</Toggle>
              {showFinancial && !!form[extra.key] && (
                <div>
                  <label className={label}>Prijs {extra.label}</label>
                  <input type="number" min="0" step="0.01" value={extraPrices[extra.key] ?? ''} onChange={e => updateExtraPrice(extra.key, e.target.value)} className={input} disabled={readOnly} placeholder="0.00" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {showFinancial && (
        <section className="space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Financieel</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div><label className={label}>Basisprijs</label><input type="number" min="0" step="0.01" value={form.basisprijs ?? form.afgesproken_prijs ?? ''} onChange={e => { const v = e.target.value === '' ? null : Number(e.target.value); update('basisprijs', v); update('afgesproken_prijs', v) }} className={input} disabled={readOnly} /></div>
            <div><label className={label}>Afgesproken totaal/prijs</label><input type="number" min="0" step="0.01" value={form.afgesproken_prijs ?? ''} onChange={e => update('afgesproken_prijs', e.target.value === '' ? null : Number(e.target.value))} className={input} disabled={readOnly} /></div>
            <div><label className={label}>Voorschot bedrag</label><input type="number" min="0" step="0.01" value={form.voorschot_bedrag ?? ''} onChange={e => update('voorschot_bedrag', e.target.value === '' ? null : Number(e.target.value))} className={input} disabled={readOnly} /></div>
          </div>
        </section>
      )}

      {!readOnly && (
        <div className="flex justify-end pt-1">
          <button onClick={() => save()} className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors">
            <Save size={14} /> Opslaan
          </button>
        </div>
      )}
    </div>
  )
}
