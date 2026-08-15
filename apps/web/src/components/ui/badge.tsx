// apps/web/src/components/ui/badge.tsx
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

type BadgeTone = 'default' | 'info' | 'warning' | 'success' | 'danger' | 'neutral'

const toneClasses: Record<BadgeTone, string> = {
  default: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  info: 'bg-sky-100 text-sky-800 ring-sky-200',
  warning: 'bg-amber-100 text-amber-800 ring-amber-200',
  success: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  danger: 'bg-rose-100 text-rose-800 ring-rose-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
}

export function Badge({ className, tone = 'default', ...props }: ComponentProps<'span'> & { tone?: BadgeTone }) {
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', toneClasses[tone], className)} {...props} />
}
