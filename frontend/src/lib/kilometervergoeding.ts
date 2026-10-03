/**
 * Kilometervergoeding is always an explicitly stored euro amount.
 * Legacy distance/rate fields are deliberately ignored.
 */
export function getManualKilometervergoeding(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}
