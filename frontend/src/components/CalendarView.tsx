import { useState } from 'react'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday } from 'date-fns'
import { nl } from 'date-fns/locale'
import { Booking } from '../types/booking'

export function CalendarView({
  bookings,
  onSelectBooking: _onSelectBooking,
  selectedDay,
  onSelectDay,
}: {
  bookings: Booking[]
  onSelectBooking: (id: number) => void
  selectedDay?: Date | null
  onSelectDay?: (day: Date) => void
}) {
  const [currentMonth, setCurrentMonth] = useState(selectedDay ?? new Date())
  const start = startOfMonth(currentMonth)
  const end = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start, end })
  const startPad = start.getDay() === 0 ? 6 : start.getDay() - 1
  const padded = Array(startPad).fill(null)

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() - 1))}
          className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-700 transition-colors text-lg font-medium"
        >
          ‹
        </button>
        <h2 className="text-base font-semibold text-gray-900 capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: nl })}
        </h2>
        <button
          onClick={() => setCurrentMonth(d => new Date(d.getFullYear(), d.getMonth() + 1))}
          className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-700 transition-colors text-lg font-medium"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {padded.map((_, i) => <div key={`pad-${i}`} />)}
        {days.map(day => {
          const dayBookings = bookings.filter(b => {
            try { return isSameDay(parseISO(b.feest_datum), day) } catch { return false }
          })
          const hasBooking = dayBookings.length > 0
          const today = isToday(day)
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false
          const hasTrouw = dayBookings.some(b => b.type_feest === 'Trouw')
          const hasAlgemeen = dayBookings.some(b => b.type_feest !== 'Trouw')

          return (
            <div
              key={day.toISOString()}
              onClick={() => onSelectDay?.(day)}
              className={`flex flex-col items-center py-1 rounded-xl transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#007AFF]'
                  : today
                  ? 'bg-[#007AFF]/10'
                  : hasBooking
                  ? 'hover:bg-gray-100'
                  : 'hover:bg-gray-50'
              }`}
            >
              <span className={`text-xs font-medium ${
                isSelected
                  ? 'text-white font-bold'
                  : today
                  ? 'text-[#007AFF] font-bold'
                  : 'text-gray-600'
              }`}>
                {format(day, 'd')}
              </span>
              <div className="flex gap-0.5 mt-0.5 h-2 items-center">
                {hasTrouw && (
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-pink-300' : 'bg-pink-400'}`} />
                )}
                {hasAlgemeen && (
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-blue-300' : 'bg-[#007AFF]'}`} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
