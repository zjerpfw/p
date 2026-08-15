// apps/web/src/components/ui/command.tsx
import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return <CommandPrimitive className={cn('flex h-full w-full flex-col overflow-hidden rounded-lg bg-white text-slate-900', className)} {...props} />
}

export function CommandDialog({ children, ...props }: React.ComponentProps<typeof Dialog>) {
  return <Dialog {...props}><DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>{children}</DialogContent></Dialog>
}

export function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return <div className="flex items-center border-b border-slate-200 px-4"><span className="mr-2 text-slate-400">⌕</span><CommandPrimitive.Input className={cn('h-14 w-full bg-transparent text-sm outline-none placeholder:text-slate-400', className)} {...props} /></div>
}

export function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn('max-h-[min(380px,60vh)] overflow-y-auto overflow-x-hidden p-2', className)} {...props} />
}

export function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className="py-8 text-center text-sm text-slate-500" {...props} />
}

export function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return <CommandPrimitive.Group className={cn('overflow-hidden p-1 text-slate-500 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold', className)} {...props} />
}

export function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return <CommandPrimitive.Item className={cn('flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm text-slate-700 data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-800', className)} {...props} />
}
