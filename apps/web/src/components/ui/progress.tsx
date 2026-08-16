// apps/web/src/components/ui/progress.tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

function Progress({ className, value = 0, ...props }: React.ComponentProps<'div'> & { value?: number }) {
  const normalizedValue = Math.max(0, Math.min(100, value))

  return (
    <div
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={normalizedValue}
      role="progressbar"
      className={cn('h-2 w-full overflow-hidden rounded-full bg-primary/15', className)}
      {...props}
    >
      <div
        className="h-full bg-primary transition-[width] duration-200 ease-out"
        style={{ width: `${normalizedValue}%` }}
      />
    </div>
  )
}

export { Progress }
