import { useState, useEffect, Component } from 'react'
import type { ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { getBooking } from '../lib/api'
import { Booking } from '../types/booking'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'

class PricingOverviewErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message + '\n' + error.stack?.slice(0, 300) }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-red-50 p-8">
          <h1 className="text-red-700 font-bold text-lg mb-4">Prijsoverzicht Fout</h1>
          <pre className="text-xs text-red-600 bg-white p-4 rounded border border-red-200 whitespace-pre-wrap">{this.state.error}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

export function generatePricingOverview(booking: Booking, dateStr: string) {
  return (
    <>
      {/* ── PAGINA 2: PRIJSOVERZICHT ── */}
      {(() => {
        const basisprijs = Number(booking.basisprijs) || 0
        let extraPrijzenDJ: Record<string, number> = {}
        try { extraPrijzenDJ = JSON.parse(booking.extra_prijzen || '{}') } catch {}
        const korting = Number(extraPrijzenDJ['_korting']) || 0

        const EXTRAS_INFO: { key: string; label: string; emoji: string; prijs: number | null; opAanvraag?: boolean }[] = [
          { key: 'ceremonie_set',     label: 'Ceremonie Set',              emoji: '🎵', prijs: 250 },
          { key: 'digital_booth',     label: 'Digitale Photobooth',        emoji: '📸', prijs: 175 },
          { key: 'retro_booth',       label: 'Photobooth met Prints',      emoji: '🎞️', prijs: null, opAanvraag: true },
          { key: 'draadloze_speaker', label: 'Extra Luidspreker Receptie', emoji: '🔊', prijs: 25 },
          { key: 'karaoke',           label: 'Karaoke',                    emoji: '🎤', prijs: 150 },
        ]

        const geselecteerd = EXTRAS_INFO.filter(e => !!(booking as unknown as Record<string, unknown>)[e.key])
        const extrasTotal = geselecteerd.reduce((s, e) => s + (e.opAanvraag ? 0 : (Number(extraPrijzenDJ[e.key] ?? e.prijs ?? 0))), 0)
        const totaal = Math.max(0, basisprijs + extrasTotal - korting)
        const restbedrag = Math.max(0, totaal - 100)
        const heeftPrijs = basisprijs > 0 || geselecteerd.some(e => !e.opAanvraag)

        if (!heeftPrijs && geselecteerd.length === 0) return null

        return (
          <div className="print-page max-w-3xl mx-auto bg-white shadow-lg print:shadow-none my-6 print:my-0 print:mt-0 p-8 print:p-6 font-sans">
            {/* Header pagina 2 */}
            <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-6">
              <img src="/logo-dj-kwinten.jpg" alt="DJ Kwinten" className="h-14 object-contain" />
              <div className="text-right">
                <h1 className="text-2xl font-black tracking-tight text-black">PRIJSOVERZICHT</h1>
                <p className="text-sm text-gray-500 mt-0.5 capitalize">{booking.type_feest} · {dateStr}</p>
              </div>
            </div>

            {/* Klant + datum */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Opdrachtgever</p>
                  <p className="text-base font-bold text-black">{booking.naam_organisator || '—'}</p>
                  {booking.naam_partner1 && booking.naam_partner2 && (
                    <p className="text-sm text-pink-600 font-semibold">💍 {booking.naam_partner1} & {booking.naam_partner2}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Datum feest</p>
                  <p className="text-sm font-bold text-black capitalize">{dateStr}</p>
                  {booking.locatie_naam && <p className="text-sm text-gray-500">{booking.locatie_naam}</p>}
                </div>
              </div>
            </div>

            {/* Prijsdetail tabel */}
            <div className="mb-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-1 mb-3">Gekozen opties</h2>
              <table className="w-full">
                <tbody>
                  {basisprijs > 0 && (
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 text-sm text-gray-700 font-medium">🎧 DJ Kwinten — Basisprijs</td>
                      <td className="py-2.5 text-sm font-bold text-black text-right">€ {basisprijs.toFixed(2)}</td>
                    </tr>
                  )}
                  {geselecteerd.map(e => {
                    const prijs = extraPrijzenDJ[e.key] ?? e.prijs
                    return (
                      <tr key={e.key} className="border-b border-gray-100">
                        <td className="py-2.5 text-sm text-gray-700 font-medium">{e.emoji} {e.label}</td>
                        <td className="py-2.5 text-sm font-bold text-right">
                          {e.opAanvraag
                            ? <span className="text-blue-600 italic font-normal">op aanvraag</span>
                            : <span className="text-black">€ {Number(prijs).toFixed(2)}</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                  {korting > 0 && (
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 text-sm text-green-700 font-medium">🎁 Korting</td>
                      <td className="py-2.5 text-sm font-bold text-green-700 text-right">- € {korting.toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totaal blok */}
            {heeftPrijs && (
              <div className="bg-gray-100 border-2 border-gray-300 rounded-xl p-4 mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-gray-500">Totaalbedrag</span>
                  <span className="text-2xl font-black text-gray-900">€ {totaal.toFixed(2)}</span>
                </div>
                <div className="border-t border-gray-300 pt-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Voorschot (reeds betaald / te betalen)</span>
                    <span className="font-bold text-gray-800">€ 100,00</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Restbedrag</span>
                    <span className="font-black text-xl text-gray-900">€ {restbedrag.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Betaalinstructies */}
            <div className="border-2 border-gray-200 rounded-xl p-4 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">💳 Betaling restbedrag</h2>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 text-base">1</div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Bij voorkeur: cash op de avond zelf</p>
                  <p className="text-xs text-gray-500">Geef het bedrag persoonlijk af aan de DJ op de dag van het feest.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 text-base">2</div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">Uiterlijk binnen de 14 dagen na het feest</p>
                  <p className="text-xs text-gray-500">Cash of via overschrijving op BE95 1431 0785 9758.</p>
                </div>
              </div>
            </div>

            {/* Footer pagina 2 */}
            <div className="mt-6 flex items-center justify-between text-xs text-gray-400 border-t border-gray-200 pt-3">
              <span>Den Tandt Kwinten · BTW BE 0726.773.488 · BE95 1431 0785 9758</span>
              <span>ID #{booking.id}</span>
            </div>
          </div>
        )
      })()}
    </>
  )
}

function PricingOverviewInner() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getBooking(id).then(data => { setBooking(data); setLoading(false) })
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="animate-pulse text-gray-500">Laden...</div>
    </div>
  )
  if (!booking) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <p className="text-gray-500">Boeking niet gevonden</p>
    </div>
  )

  const dateStr = booking.feest_datum
    ? format(parseISO(booking.feest_datum), 'EEEE d MMMM yyyy', { locale: nl })
    : '—'

  return (
    <div className="bg-gray-100 print:bg-white min-h-screen document-print-root document-pricing-overview">
      <style>{`@media print { @page { size: A4; margin: 12mm; } }`}</style>
      <div className="print:hidden bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(`/boeking/${id}`)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft size={18} /> Terug
        </button>
        <span className="flex-1 text-sm text-gray-400">Prijsoverzicht / Financieel document</span>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] text-white px-4 py-2 rounded-xl font-semibold transition-colors">
          <Printer size={16} /> Download/Print PDF
        </button>
      </div>

      {generatePricingOverview(booking, dateStr)}
    </div>
  )
}

export function PricingOverview() {
  return (
    <PricingOverviewErrorBoundary>
      <PricingOverviewInner />
    </PricingOverviewErrorBoundary>
  )
}
