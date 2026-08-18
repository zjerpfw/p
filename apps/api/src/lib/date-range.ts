// apps/api/src/lib/date-range.ts
import { shanghaiDateKeyToUtc } from './shanghai-date'

export interface DateRange {
  from?: Date
  toExclusive?: Date
}

export function parseShanghaiDateRange(fromValue: string | undefined, toValue: string | undefined): DateRange | null {
  let from: Date | undefined
  let to: Date | undefined
  try {
    from = fromValue ? shanghaiDateKeyToUtc(fromValue) : undefined
    to = toValue ? shanghaiDateKeyToUtc(toValue) : undefined
  } catch {
    return null
  }
  if (from && to && from > to) return null
  return { from, toExclusive: to ? new Date(to.getTime() + 86_400_000) : undefined }
}
