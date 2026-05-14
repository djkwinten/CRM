import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, RefreshCw, ChevronRight, MapPin } from 'lucide-react'
import { format, parseISO, isSameDay } from 'date-fns'
import { nl } from 'date-fns/locale'
import { getBookings } from '../lib/api'
import { Booking } from '../types/booking'
import { CalendarView } from '../components/CalendarView'
import { BottomTabBar } from '../components/BottomTabBar'

function displayNaam(b: Booking): string {
  if (b.type_feest === 'Trouw' && (b.naam_partner1 || b.naam_partner2)) {
    const v1 = (b.naam_partner1 || '').split(' ')[0]
    const v2 = (b.naam_partner2 || '').split(' ')[0]
    return [v1, v2].filter(Boolean).join(' & ') || b.naam_organisator || '—'
  }
  return b.naam_organisator || '—'
}

export function Agenda() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const monthRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getBookings()
      const sorted = [...data].sort((a: Booking, b: Booking) =>
        a.feest_datum.localeCompare(b.feest_datum)
      )
      setBookings(sorted)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const grouped = bookings.reduce((acc, b) => {
    const key = b.feest_datum.slice(0, 7)
    if (!acc[key]) acc[key] = []
    acc[key].push(b)
    return acc
  }, {} as Record<string, Booking[]>)

  const monthKeys = Object.keys(grouped).sort()

  const handleSelectDay = (day: Date) => {
    setSelectedDay(prev => prev && isSameDay(prev, day) ? null : day)
    const key = format(day, 'yyyy-MM')
    setTimeout(() => {
      monthRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  return (
    <div className="min-h-screen bg-[#F2F2F7]">
      <header className="sticky top-0 z-40">
        <div className="bg-gradient-to-r from-[#007AFF] via-[#5856D6] to-[#AF52DE] px-4 sm:px-6 pb-4 safe-top">
          <div className="max-w-4xl mx-auto flex items-center gap-4 pt-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-9 h-9 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <Calendar size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-bold text-base text-white">Agenda</h1>
                <p className="text-xs text-white/70">{bookings.length} feesten gepland</p>
              </div>
            </div>
            <button onClick={load} className="p-2 hover:bg-white/20 rounded-xl text-white/70 hover:text-white transition-colors">
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/60" />
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 pb-28">
        {loading ? (
          <div className="text-center py-16 text-gray-400 animate-pulse">Laden...</div>
        ) : (
          <>
            {/* Kalender bovenaan */}
            <div className="mb-6">
              <CalendarView
                bookings={bookings}
                onSelectBooking={(id) => navigate(`/boeking/${id}`)}
                selectedDay={selectedDay}
                onSelectDay={handleSelectDay}
              />
            </div>

            {/* Lijst per maand */}
            {monthKeys.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Geen feesten gevonden</div>
            ) : (
              <div className="space-y-5">
                {monthKeys.map(key => {
                  const monthBookings = grouped[key]
                  const monthDate = parseISO(`${key}-01`)

                  return (
                    <div key={key} ref={el => { monthRefs.current[key] = el }}>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">
                        {format(monthDate, 'MMMM yyyy', { locale: nl })}
                      </p>
                      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden">
                        {monthBookings.map((b, idx) => {
                          let day: Date | null = null
                          try { day = parseISO(b.feest_datum) } catch { /* skip */ }
                          const isHighlighted = selectedDay && day ? isSameDay(day, selectedDay) : false
                          const isTrouw = b.type_feest === 'Trouw'
                          const isAanvraag = !!b.is_aanvraag

                          return (
                            <button
                              key={b.id}
                              onClick={() => navigate(`/boeking/${b.id}`)}
                              className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-colors ${
                                isHighlighted ? 'bg-[#007AFF]/5' : 'hover:bg-gray-50'
                              } ${idx > 0 ? 'border-t border-gray-100' : ''}`}
                            >
                              <div className={`flex-shrink-0 w-11 text-center rounded-xl py-1 ${
                                isHighlighted ? 'bg-[#007AFF]/10' : ''
                              }`}>
                                {day ? (
                                  <>
                                    <div className="text-[10px] font-medium text-gray-400 uppercase leading-tight">
                                      {format(day, 'EEE', { locale: nl })}
                                    </div>
                                    <div className={`text-xl font-bold leading-tight ${
                                      isHighlighted ? 'text-[#007AFF]' : 'text-gray-800'
                                    }`}>
                                      {format(day, 'd')}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-xs text-gray-300">?</div>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-sm text-gray-900">
                                    {isTrouw ? '💍' : '🎉'} {displayNaam(b)}
                                  </span>
                                  {isAanvraag && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 flex-shrink-0">
                                      Aanvraag
                                    </span>
                                  )}
                                </div>
                                {b.locatie_naam ? (
                                  <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
                                    <MapPin size={10} className="flex-shrink-0" />
                                    <span className="truncate">{b.locatie_naam}</span>
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-400 mt-0.5">{b.type_feest}</div>
                                )}
                              </div>

                              <ChevronRight size={14} className="flex-shrink-0 text-gray-300" />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>

      <BottomTabBar />
    </div>
  )
}
