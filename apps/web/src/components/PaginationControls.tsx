// apps/web/src/components/PaginationControls.tsx
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PaginationControlsProps {
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
}

export function PaginationControls({ page, totalPages, total, onPageChange }: PaginationControlsProps) {
  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <span className="text-muted-foreground">共 {total} 条，第 {page} / {totalPages} 页</span>
      <div className="flex items-center gap-2">
        <Button aria-label="上一页" disabled={page <= 1} onClick={() => onPageChange(page - 1)} size="icon-sm" type="button" variant="outline">
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button aria-label="下一页" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} size="icon-sm" type="button" variant="outline">
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
