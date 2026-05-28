import { useState, useEffect, useRef, Component } from 'react'
import type { ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { getBooking } from '../lib/api'
import { Booking } from '../types/booking'
import { format, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import QRCode from 'qrcode'

// Parst het MULTI-formaat van tweede_dans_nummer naar leesbare regels
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
    }).join('\n')
  } catch { return raw }
}

function GigRow({ label, value, color }: { label: string; value?: string | null; color?: 'green' | 'red' }) {
  if (!value) return null
  const bg = color === 'green' ? 'bg-green-50' : color === 'red' ? 'bg-red-50' : ''
  const textColor = color === 'green' ? 'text-green-800' : color === 'red' ? 'text-red-800' : 'text-gray-900'
  const labelColor = color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : 'text-gray-500'
  const lines = value.split('\n').filter(Boolean)
  return (
    <tr className={`border-b border-gray-200 ${bg}`}>
      <td className={`py-1.5 pr-4 text-xs font-semibold uppercase whitespace-nowrap w-40 align-top ${labelColor}`}>{label}</td>
      <td className={`py-1.5 text-sm font-medium ${textColor}`}>
        {lines.length > 1
          ? <ul className="space-y-0.5">{lines.map((l, i) => <li key={i}>• {l}</li>)}</ul>
          : value
        }
      </td>
    </tr>
  )
}

function SpotifyQR({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvasRef.current && url) {
      QRCode.toCanvas(canvasRef.current, url, { width: 96, margin: 1 })
    }
  }, [url])
  return <canvas ref={canvasRef} className="rounded" />
}

function GigBool({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
        value ? 'border-black bg-black' : 'border-gray-400'
      }`}>
        {value ? <span className="text-white text-xs leading-none">✓</span> : null}
      </div>
      <span className="text-sm text-gray-800">{label}</span>
    </div>
  )
}

export function generateDjSheet(booking: Booking, dateStr: string, isTrouw: boolean) {
  return (
    <>
      {/* A4 Print Sheet */}
      <div className="print-page max-w-3xl mx-auto bg-white shadow-lg print:shadow-none my-6 print:my-0 p-8 print:p-6 font-sans">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-5">
          <img src="/logo-dj-kwinten.jpg" alt="DJ Kwinten" className="h-16 object-contain" />
          <div className="text-right">
            <h1 className="text-2xl font-black tracking-tight text-black">GIG SHEET</h1>
            <p className="text-sm text-gray-500 mt-0.5 capitalize">{booking.type_feest} · {dateStr}</p>
          </div>
        </div>

        {/* Essential Info */}
        <div className="grid grid-cols-2 gap-4 mb-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Klant</p>
            <p className="text-base font-bold text-black">{booking.naam_organisator || '—'}</p>
            {isTrouw && (booking.naam_partner1 || booking.naam_partner2) && (
              <p className="text-sm font-semibold text-pink-600">
                💍 {[booking.naam_partner1, booking.naam_partner2].filter(Boolean).join(' & ')}
              </p>
            )}
            {booking.bedrijfsnaam && <p className="text-sm text-gray-600">{booking.bedrijfsnaam}</p>}
            {booking.telefoon && <p className="text-sm text-gray-700">{booking.telefoon}</p>}
            {booking.email && <p className="text-sm text-gray-700">{booking.email}</p>}
            {(booking.backup_contact_naam || booking.backup_contact_telefoon) && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase">📞 Back-up Contact (avond)</p>
                <p className="text-sm font-semibold text-black">{booking.backup_contact_naam}</p>
                {booking.backup_contact_telefoon && <p className="text-sm text-gray-700">{booking.backup_contact_telefoon}</p>}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase">Datum & Locatie</p>
            <p className="text-base font-bold text-black capitalize">{dateStr}</p>
            {booking.locatie_naam && <p className="text-sm font-semibold text-gray-700">📍 {booking.locatie_naam}</p>}
            {booking.locatie_adres && <p className="text-sm text-gray-500">{booking.locatie_adres}</p>}
            {booking.aantal_gasten && <p className="text-sm text-gray-600">{booking.aantal_gasten} gasten</p>}
            {booking.thema && <p className="text-sm text-gray-600">Thema: {booking.thema}</p>}
          </div>
        </div>

        {/* Planning */}
        {(booking.uur_receptie || booking.uur_diner || booking.uur_dansfeest || booking.planning_extra) && (
          <div className="mb-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-1 mb-3">⏱ Planning</h2>
            {(booking.uur_receptie || booking.uur_diner || booking.uur_dansfeest) && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
                {[
                  { label: 'Ceremonie', value: booking.uur_ceremonie },
                  { label: 'Receptie', value: booking.uur_receptie },
                  { label: 'Diner', value: booking.uur_diner },
                  { label: 'Dessert', value: booking.uur_dessert },
                  { label: 'Dansfeest', value: booking.uur_dansfeest },
                  { label: 'Midnight Snack', value: booking.uur_midnightsnack },
                  { label: 'Einduur', value: booking.einduur },
                ].filter(x => x.value).map(x => (
                  <div key={x.label} className="bg-gray-50 border border-gray-200 rounded p-2 text-center">
                    <div className="text-xs text-gray-500">{x.label}</div>
                    <div className="text-base font-bold font-mono text-black">{x.value}</div>
                  </div>
                ))}
              </div>
            )}
            {booking.planning_extra && (() => {
              type Moment = { label: string; uur?: string; wie?: string }
              let momenten: Moment[] = []
              try { momenten = JSON.parse(booking.planning_extra!) } catch {}
              if (!momenten.length) return null
              return (
                <div className="bg-amber-50 border border-amber-200 rounded p-3">
                  <span className="text-xs font-bold uppercase text-amber-600 block mb-2">🎤 Speeches & Verrassingen</span>
                  <table className="w-full">
                    <tbody>
                      {momenten.map((m, i) => {
                        const uurRaw = m.uur || ''
                        const uur = uurRaw.startsWith('Anders|') ? uurRaw.slice(7) : uurRaw
                        return (
                          <tr key={i} className="border-b border-amber-200 last:border-0">
                            <td className="py-1.5 pr-4 text-xs font-semibold text-amber-700 uppercase whitespace-nowrap w-40 align-top">{m.label}</td>
                            <td className="py-1.5 text-sm text-gray-800">
                              {uur && <span className="font-medium">{uur}</span>}
                              {m.wie && <span className="text-gray-500"> — {m.wie}</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>
        )}

        {/* Muziek */}
        <div className="mb-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-1 mb-3">🎵 Muziek</h2>
          <table className="w-full">
            <tbody>
              <GigRow label="✅ Top Genres" value={booking.top_genres} color="green" />
              <GigRow label="❌ Flop Genres" value={booking.flop_genres} color="red" />
              <GigRow label="✅ Must Play" value={booking.must_play} color="green" />
              <GigRow label="❌ Do Not Play" value={booking.do_not_play} color="red" />
              <GigRow label="🥂 Muziek Receptie" value={booking.muziek_receptie} />
              <GigRow label="🍽️ Muziek Diner" value={booking.muziek_diner} />
              <GigRow label="Verzoeknummers" value={booking.verzoeknummers} />
            </tbody>
          </table>
        </div>

        {/* Speciale nummers */}
        <div className="mb-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-1 mb-3">
            {isTrouw ? '💕 Speciale Nummers' : '🎤 Speciale Nummers'}
          </h2>
          <table className="w-full">
            <tbody>
              {isTrouw && <>
                <GigRow label="🚶 Intrede Gasten" value={booking.intrede_zaal_nummer} />
                <GigRow label="👰 Bruidsmeisjes" value={booking.intrede_bridesmaids_nummer} />
                <GigRow label="🤵 Groomsmen" value={booking.intrede_groomsmen_nummer} />
                <GigRow label="💍 Intrede Koppel" value={booking.intrede_koppel_nummer} />
                <GigRow label="🍰 Taart" value={booking.intrede_taart_nummer} />
                <GigRow label="🥂 Eretafel" value={booking.intrede_eretafel_nummer} />
                <GigRow label="💃 Openingsdans" value={booking.openingsdans_nummer} />
                <GigRow label="🕺 Na Openingsdans" value={parseTweedeDans(booking.tweede_dans_nummer)} />
                <GigRow label="💐 Boeket Werpen" value={booking.boeket_werpen_nummer} />
              </>}
              {!isTrouw && booking.intrede_zaal_nummer && (
                <GigRow label="🚶 Intrede" value={booking.intrede_zaal_nummer} />
              )}
              <GigRow label="🎂 Verjaardag" value={booking.verjaardag_naam_leeftijd} />
            </tbody>
          </table>
          {!booking.openingsdans_nummer && !booking.intrede_zaal_nummer && !booking.verjaardag_naam_leeftijd && (
            <p className="text-xs text-gray-400 italic">Nog niet ingevuld</p>
          )}
        </div>

        {/* Zaal & Techniek */}
        <div className="mb-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-1 mb-3">🔊 Zaal & Techniek</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <table className="w-full">
                <tbody>
                  <GigRow label="📍 Adres Zaal" value={booking.locatie_adres} />
                  <GigRow label="Zaal Contact" value={booking.zaal_contact} />
                  <GigRow label="Geluidslimiet" value={booking.geluidsbeperking_info} />
                  <GigRow label="Wifi Code" value={booking.wifi_code} />
                  <GigRow label="🚗 Parkeren" value={booking.parkeren_info} />
                  {booking.gelijkvloers !== undefined && booking.gelijkvloers !== null && (
                    <tr className="border-b border-gray-200">
                      <td className="py-1.5 pr-4 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap w-40">Toegang</td>
                      <td className="py-1.5 text-sm text-gray-900">
                        {booking.gelijkvloers ? '🏠 Gelijkvloers' : '🏢 Verdieping / Lift'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <GigBool label="Speakers" value={booking.speakers_aanwezig} />
              <GigBool label="Licht" value={booking.licht_aanwezig} />
              <GigBool label="Micro" value={booking.micro_aanwezig} />
              <GigBool label="DJ Booth" value={booking.dj_booth_aanwezig} />
              <GigBool label="Uplights" value={booking.uplights_aanwezig} />
            </div>
          </div>
        </div>

        {/* Extra's */}
        <div className="mb-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-1 mb-3">⭐ Extra's</h2>
          <div className="grid grid-cols-5 gap-2">
            <GigBool label="Ceremonie Set" value={booking.ceremonie_set} />
            <GigBool label="Digital Booth" value={booking.digital_booth} />
            <GigBool label="Retro Booth" value={booking.retro_booth} />
            <GigBool label="Draadloze Spk." value={booking.draadloze_speaker} />
            <GigBool label="Karaoke" value={booking.karaoke} />
          </div>
        </div>

        {/* Spotify QR */}
        {booking.spotify_link && (
          <div className="mb-5 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-4">
            <SpotifyQR url={booking.spotify_link} />
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">🎧 Spotify Playlist</h2>
              <p className="text-xs text-gray-400 leading-relaxed">Scan de QR-code<br />om de playlist te openen</p>
            </div>
          </div>
        )}

        {/* Notes area */}
        {booking.opmerkingen ? (
          <div className="border-t-2 border-black pt-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Notities</h2>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-800 whitespace-pre-wrap">
              {booking.opmerkingen}
            </div>
          </div>
        ) : (
          <div className="print:hidden border-t-2 border-black pt-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Notities</h2>
            <div className="h-20 border border-gray-300 rounded"></div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
          <span>DJ Manager · {dateStr}</span>
          <span>ID #{booking.id}</span>
        </div>
      </div>
    </>
  )
}

class GigSheetErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
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
          <h1 className="text-red-700 font-bold text-lg mb-4">Gig Sheet Fout</h1>
          <pre className="text-xs text-red-600 bg-white p-4 rounded border border-red-200 whitespace-pre-wrap">{this.state.error}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

function GigSheetInner() {
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

  const isTrouw = booking.type_feest === 'Trouw'
  const dateStr = booking.feest_datum
    ? format(parseISO(booking.feest_datum), 'EEEE d MMMM yyyy', { locale: nl })
    : '—'

  return (
    <div className="bg-gray-100 print:bg-white min-h-screen document-print-root document-dj-sheet">
      <style>{`@media print { @page { margin: 10mm; } }`}</style>
      {/* Screen-only controls */}
      <div className="print:hidden bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(`/boeking/${id}`)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft size={18} /> Terug
        </button>
        <span className="flex-1 text-sm text-gray-400">DJ Sheet Preview — zonder prijsinformatie</span>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] text-white px-4 py-2 rounded-xl font-semibold transition-colors">
          <Printer size={16} /> Download/Print DJ Sheet
        </button>
      </div>

      {generateDjSheet(booking, dateStr, isTrouw)}

    </div>
  )
}

export function GigSheet() {
  return (
    <GigSheetErrorBoundary>
      <GigSheetInner />
    </GigSheetErrorBoundary>
  )
}
