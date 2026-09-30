import { Camera, CameraOff, CircleAlert } from 'lucide-react'
import type { Booking } from '../types/booking'
import { getPhotoConsentPolicy } from '../lib/photoConsent'

export function PhotoConsentAlert({ booking }: { booking: Booking }) {
  const policy = getPhotoConsentPolicy(booking.toestemming_foto)
  const allowed = policy.state === 'allowed'
  const denied = policy.state === 'denied'
  const Icon = allowed ? Camera : denied ? CameraOff : CircleAlert
  const colors = allowed
    ? 'border-green-600 bg-green-50 text-green-900'
    : denied
      ? 'border-red-600 bg-red-50 text-red-900'
      : 'border-amber-500 bg-amber-50 text-amber-900'

  return (
    <div
      className={`mb-5 flex items-center gap-3 rounded-lg border-2 px-4 py-3 ${colors}`}
      role={denied || policy.state === 'unknown' ? 'alert' : 'status'}
      aria-label={policy.gigTitle}
    >
      <Icon size={32} strokeWidth={2.5} className="flex-shrink-0" aria-hidden="true" />
      <div>
        <p className="text-sm font-black uppercase tracking-wide">{policy.gigTitle}</p>
        <p className="text-xs font-semibold mt-0.5">{policy.gigText}</p>
      </div>
    </div>
  )
}
