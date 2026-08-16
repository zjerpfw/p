// apps/web/src/lib/money.ts
const YUAN_PATTERN = /^(\d+)(?:\.(\d{0,2}))?$/

export function yuanToCents(value: string): number | null {
  const normalized = value.trim()
  const match = YUAN_PATTERN.exec(normalized)
  if (!match) return null

  const yuan = Number(match[1])
  const fraction = (match[2] ?? '').padEnd(2, '0')
  const cents = yuan * 100 + Number(fraction)
  return Number.isSafeInteger(cents) ? cents : null
}

export function centsToYuanInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isSafeInteger(cents)) return ''
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  const yuan = Math.floor(absolute / 100)
  const fraction = absolute % 100
  return fraction === 0 ? `${sign}${yuan}` : `${sign}${yuan}.${String(fraction).padStart(2, '0')}`
}

export function formatCents(cents: number | null | undefined): string {
  const value = Number.isSafeInteger(cents) ? (cents as number) : 0
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100)
}
