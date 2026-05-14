import { Copy, ExternalLink, CheckCircle2, XCircle } from 'lucide-react'
import { Booking } from '../../../types/booking'

export function QuestionnaireTab({ booking, onShowChanges }: { booking: Booking; onShowChanges: () => void }) {
  const path = booking.slug ? `/vragenlijst/${booking.slug}` : `/formulier/${booking.id}`
  const copy = () => {
    const url = `${window.location.origin}${path}`
    navigator.clipboard.writeText(url)
    alert(`Vragenlijst-link gekopieerd!\n\n${url}`)
  }

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5 space-y-4">
      <div>
        <h2 className="font-bold text-gray-900">Vragenlijst</h2>
        <p className="text-xs text-gray-400 mt-0.5">De bestaande uitgebreide vragenlijst blijft behouden. Hier staan enkel de links en status.</p>
      </div>
      <div className={`flex items-center gap-2 p-3 rounded-xl border ${booking.status_vragenlijst ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
        {booking.status_vragenlijst ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
        <span className="text-sm font-semibold">{booking.status_vragenlijst ? 'Vragenlijst ingevuld' : 'Vragenlijst nog niet ingevuld'}</span>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <a href={path} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-[#007AFF] hover:bg-[#0066CC] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
          <ExternalLink size={15} /> Open vragenlijst
        </a>
        <button onClick={copy} className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
          <Copy size={15} /> Kopieer link
        </button>
        {booking.vragenlijst_updated_at && booking.vragenlijst_first_submitted_at && (
          <button onClick={onShowChanges} className="flex items-center justify-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors">
            ! Bekijk wijzigingen
          </button>
        )}
      </div>
    </div>
  )
}
