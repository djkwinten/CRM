import { Mail, MessageSquare } from 'lucide-react'
import { Booking } from '../../../types/booking'

export function CommunicationTab({ booking }: { booking: Booking }) {
  const hasReceivedEmail = !!booking.source_original_message

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.04)] p-5">
      <h2 className="font-bold text-gray-900 flex items-center gap-2"><MessageSquare size={18} className="text-[#007AFF]" /> Communicatie</h2>
      {hasReceivedEmail ? (
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-100 p-2 text-[#007AFF]"><Mail size={17} /></div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900">E-mail ontvangen</h3>
              <dl className="mt-2 grid gap-1 text-xs text-gray-600">
                <div><dt className="inline font-semibold">Van: </dt><dd className="inline">{booking.source_sender || '—'}</dd></div>
                <div><dt className="inline font-semibold">Onderwerp: </dt><dd className="inline">{booking.source_subject || '—'}</dd></div>
                <div><dt className="inline font-semibold">Ontvangen: </dt><dd className="inline">{booking.source_received_at ? new Date(booking.source_received_at).toLocaleString('nl-BE') : '—'}</dd></div>
              </dl>
              <div className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-gray-200 bg-white p-3 text-sm leading-relaxed text-gray-700">
                {booking.source_original_message}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-400">Nog geen communicatie beschikbaar.</p>
      )}
    </div>
  )
}
