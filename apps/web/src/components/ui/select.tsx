// apps/web/src/components/ui/select.tsx
import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return <SelectPrimitive.Trigger className={cn('flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-[3px] focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 md:h-9', className)} {...props}>{children}<SelectPrimitive.Icon><ChevronDown className="size-4 text-muted-foreground" /></SelectPrimitive.Icon></SelectPrimitive.Trigger>
}

export function SelectContent({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return <SelectPrimitive.Portal><SelectPrimitive.Content className={cn('z-50 min-w-[8rem] overflow-hidden rounded-md border border-slate-200 bg-white p-1 text-slate-900 shadow-lg', className)} position="popper" {...props}><SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport></SelectPrimitive.Content></SelectPrimitive.Portal>
}

export function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item className={cn('relative flex min-h-11 cursor-pointer select-none items-center rounded-sm py-1 pr-8 pl-2 text-sm outline-none data-[highlighted]:bg-indigo-50 data-[highlighted]:text-indigo-800 md:min-h-8', className)} {...props}><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText><SelectPrimitive.ItemIndicator className="absolute right-2"><Check className="size-3.5" /></SelectPrimitive.ItemIndicator></SelectPrimitive.Item>
}
