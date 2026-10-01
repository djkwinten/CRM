import { CameraOff } from 'lucide-react'
import type { Booking } from '../types/booking'
import { getPhotoConsentPolicy } from '../lib/photoConsent'

export function PhotoConsentAlert({ booking }: { booking: Booking }) {
  const policy = getPhotoConsentPolicy(booking.toestemming_foto)
  if (policy.state !== 'denied') return null

  return (
    <div
      className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50/60 px-2.5 py-2 text-red-800 break-inside-avoid"
      role="alert"
      aria-label={policy.gigTitle}
    >
      <CameraOff size={16} strokeWidth={2} className="flex-shrink-0" aria-hidden="true" />
      <div className="leading-tight">
        <p className="text-[10px] font-bold uppercase tracking-wide">{policy.gigTitle}</p>
        <p className="text-[10px] font-medium mt-0.5 opacity-80">{policy.gigText}</p>
      </div>
    </div>
  )
}
