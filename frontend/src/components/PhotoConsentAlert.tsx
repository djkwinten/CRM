import { Camera, CameraOff, CircleAlert } from 'lucide-react'
import type { Booking } from '../types/booking'
import { getPhotoConsentPolicy } from '../lib/photoConsent'

export function PhotoConsentAlert({ booking }: { booking: Booking }) {
  const policy = getPhotoConsentPolicy(booking.toestemming_foto)
  const allowed = policy.state === 'allowed'
  const denied = policy.state === 'denied'
  const Icon = allowed ? Camera : denied ? CameraOff : CircleAlert
  const colors = allowed
    ? 'border-green-200 bg-green-50/60 text-green-800'
    : denied
      ? 'border-red-200 bg-red-50/60 text-red-800'
      : 'border-amber-200 bg-amber-50/60 text-amber-800'

  return (
    <div
      className={`mt-4 flex items-center gap-2 rounded-md border px-2.5 py-2 break-inside-avoid ${colors}`}
      role={denied || policy.state === 'unknown' ? 'alert' : 'status'}
      aria-label={policy.gigTitle}
    >
      <Icon size={16} strokeWidth={2} className="flex-shrink-0" aria-hidden="true" />
      <div className="leading-tight">
        <p className="text-[10px] font-bold uppercase tracking-wide">{policy.gigTitle}</p>
        <p className="text-[10px] font-medium mt-0.5 opacity-80">{policy.gigText}</p>
      </div>
    </div>
  )
}
