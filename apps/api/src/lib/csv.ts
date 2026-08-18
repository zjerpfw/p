// apps/api/src/lib/csv.ts
function escapeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  const rawText = value instanceof Date ? value.toISOString() : String(value)
  const text = /^[=+\-@]/.test(rawText) ? `'${rawText}` : rawText
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(headers: string[], rows: unknown[][]) {
  return `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')}`
}

export function csvResponse(filename: string, headers: string[], rows: unknown[][]) {
  return new Response(toCsv(headers, rows), {
    headers: {
      'Content-Disposition': `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Type': 'text/csv; charset=utf-8',
    },
  })
}
