import { Booking } from '../../../types/booking'

export function OverviewTab({ booking }: { booking: Booking }) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5">
      <h2 className="font-bold text-gray-900 mb-2">Overzicht</h2>
      <p className="text-sm text-gray-500">De bestaande detailweergave staat hieronder ongewijzigd. Gebruik de tabs om naar Contract Info, Vragenlijst, Bestanden of Communicatie te gaan.</p>
      <div className="grid sm:grid-cols-3 gap-3 mt-4">
        <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400 uppercase">Klant</p><p className="text-sm font-semibold text-gray-900">{booking.naam_organisator || '—'}</p></div>
        <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400 uppercase">Datum</p><p className="text-sm font-semibold text-gray-900">{booking.feest_datum || '—'}</p></div>
        <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400 uppercase">Locatie</p><p className="text-sm font-semibold text-gray-900">{booking.locatie_naam || '—'}</p></div>
      </div>
    </div>
  )
}
