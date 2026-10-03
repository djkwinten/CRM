export type UpcomingBookingFilter = 'alle' | 'contract' | 'voorschot'

type BookingStatuses = {
  status_contract?: number | null
  status_voorschot?: number | null
}

export function matchesUpcomingBookingFilter(
  booking: BookingStatuses,
  filter: UpcomingBookingFilter,
): boolean {
  if (filter === 'contract') return !booking.status_contract
  if (filter === 'voorschot') return !booking.status_voorschot
  return true
}
