const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Calendar-day difference, independent of time of day and daylight-saving changes. */
export function daysUntilEvent(date?: string | null, now = new Date()): number | null {
  if (!date) return null

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const eventUtc = Date.UTC(year, month - 1, day)
  const parsed = new Date(eventUtc)

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) return null

  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((eventUtc - todayUtc) / MS_PER_DAY)
}

export function canShowFeestNadert(date?: string | null, now = new Date()): boolean {
  const days = daysUntilEvent(date, now)
  return days !== null && days >= 0 && days <= 21
}
