// apps/api/src/lib/shanghai-date.ts
const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'

const shanghaiPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function partsFor(date: Date) {
  const parts = shanghaiPartsFormatter.formatToParts(date)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

function dateKeyFor(date: Date) {
  const { year, month, day } = partsFor(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Returns the YYYY-MM calendar month for an instant in Shanghai time. */
export function shanghaiMonthKey(date: Date) {
  const { year, month } = partsFor(date)
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Returns the UTC instant representing 00:00:00 on a Shanghai calendar date. */
export function shanghaiDateKeyToUtc(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) throw new Error('上海日期必须为 YYYY-MM-DD 格式')

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const calendarCheck = new Date(Date.UTC(year, month - 1, day))
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    throw new Error('上海日期无效')
  }

  // Derive the zone offset through Intl instead of depending on the Worker host timezone.
  const probe = new Date(Date.UTC(year, month - 1, day, 12))
  const localProbe = partsFor(probe)
  const displayedAsUtc = Date.UTC(
    localProbe.year,
    localProbe.month - 1,
    localProbe.day,
    localProbe.hour,
    localProbe.minute,
    localProbe.second,
  )
  const offsetMs = displayedAsUtc - probe.getTime()
  return new Date(Date.UTC(year, month - 1, day) - offsetMs)
}

/** Returns the UTC instant representing the start of today's Shanghai calendar day. */
export function todayInShanghai(now = new Date()): Date {
  return shanghaiDateKeyToUtc(dateKeyFor(now))
}

/** Normalizes any instant to the start of its Shanghai calendar day. */
export function startOfShanghaiDay(date: Date): Date {
  return shanghaiDateKeyToUtc(dateKeyFor(date))
}

/** Adds calendar years without using the Worker host timezone. */
export function addShanghaiCalendarYears(date: Date, years: number): Date {
  const { year, month, day } = partsFor(date)
  const targetYear = year + years
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate()
  return shanghaiDateKeyToUtc(`${targetYear}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`)
}
