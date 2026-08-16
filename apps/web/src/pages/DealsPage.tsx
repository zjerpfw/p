// apps/web/src/pages/DealsPage.tsx
import { format, isBefore, parseISO, startOfDay } from 'date-fns'
import { CalendarDays, CircleDollarSign, Pencil, Plus, Search, Trash2, Trophy, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PaginationControls } from '@/components/PaginationControls'
import SaaSDealWonModal from '@/components/deals/SaaSDealWonModal'
import { DealDetailModal } from '@/components/deals/DealDetailModal'
import { CreateDealModal } from '@/components/deals/CreateDealModal'
import { dealStages, type Deal, type DealStage, useDeals } from '@/hooks/useDeals'
import { useDealPipelineColumn, useDealPipelineSummary, type PipelineStageSummary } from '@/hooks/useDealPipeline'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useIsMobile } from '@/hooks/useIsMobile'
import { apiFetch } from '@/lib/api'
import { formatCents } from '@/lib/money'
import { dealStageLabels, getDealStageTone } from '@/lib/presentation'
import { useSearchParams } from 'react-router-dom'

const stageStyle: Record<DealStage, { line: string; dot: string }> = {
  Leads: { line: 'bg-slate-400', dot: 'bg-slate-400' },
  Qualified: { line: 'bg-sky-500', dot: 'bg-sky-500' },
  Proposal: { line: 'bg-amber-500', dot: 'bg-amber-500' },
  Won: { line: 'bg-emerald-500', dot: 'bg-emerald-500' },
  Lost: { line: 'bg-rose-500', dot: 'bg-rose-500' },
}

function formatDate(value: string) {
  return format(parseISO(value), 'yyyy-MM-dd')
}

function isOverdue(value: string | null, stage: DealStage) {
  // Expected-close-date alerts only apply to open opportunities. Won/Lost are final outcomes.
  if (!value || stage === 'Won' || stage === 'Lost') return false
  return isBefore(parseISO(value), startOfDay(new Date()))
}

interface PipelineColumnProps {
  stage: DealStage
  summary: PipelineStageSummary
  search: string
  deletePending: boolean
  onEdit: (deal: Deal) => void
  onDelete: (deal: Deal) => void
  onConfirmWon: (deal: Deal) => void
}

function PipelineColumn({ stage, summary, search, deletePending, onEdit, onDelete, onConfirmWon }: PipelineColumnProps) {
  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useDealPipelineColumn(stage, search)
  const stageDeals = data?.pages.flatMap((page) => page.data) ?? []
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = scrollContainerRef.current
    const target = loadMoreRef.current
    if (!root || !target || !hasNextPage || isFetchingNextPage) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void fetchNextPage()
      },
      { root, rootMargin: '120px 0px', threshold: 0.01 },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  return <section className="flex h-full min-h-0 w-[85vw] shrink-0 snap-center flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-inner md:w-80 md:snap-align-none">
    <header className={`shrink-0 border-t-4 ${stageStyle[stage].line} border-b border-slate-200 bg-white px-3 py-2.5`}>
      <div className="flex items-center justify-between gap-2"><h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800"><span className={`size-2 shrink-0 rounded-full ${stageStyle[stage].dot}`} />{dealStageLabels[stage]}</h2><Badge tone={getDealStageTone(stage)}>{summary.count}</Badge></div>
      <p className="mt-1 text-lg font-bold tracking-tight text-slate-700">{formatCents(summary.totalAmountCents)}</p>
    </header>
    <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-2.5" ref={scrollContainerRef}>
      {isLoading && <p className="px-3 py-6 text-center text-xs text-slate-400">正在加载商机...</p>}
      {error && <p className="px-3 py-6 text-center text-xs text-destructive">{error.message}</p>}
      {stageDeals.map((deal) => {
        const dateValue = deal.expectedCloseDate
        const overdue = isOverdue(dateValue, deal.stage)
        return <Card className="gap-0 py-0 transition-all hover:-translate-y-1 hover:shadow-md" key={deal.id}><CardContent className="space-y-2.5 p-3">
          <div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-bold text-slate-900" title={deal.customerName}>{deal.customerName}</p><div className="flex shrink-0 gap-0.5"><Button aria-label={`编辑${deal.customerName}的商机`} onClick={() => onEdit(deal)} size="icon-xs" type="button" variant="ghost"><Pencil aria-hidden="true" /></Button><Button aria-label={`作废${deal.customerName}的商机`} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" disabled={deletePending} onClick={() => onDelete(deal)} size="icon-xs" type="button" variant="ghost"><Trash2 aria-hidden="true" /></Button></div></div>
          <div className="flex items-center gap-1.5 text-lg font-bold tracking-tight text-indigo-700"><CircleDollarSign aria-hidden="true" className="size-4 shrink-0" />{deal.originalPriceCents && deal.originalPriceCents > deal.amountCents && <span className="text-xs font-normal text-slate-400 line-through">{formatCents(deal.originalPriceCents)}</span>}{formatCents(deal.amountCents)}</div>
          <div className="flex flex-wrap gap-1.5"><Badge tone="neutral">{deal.productName}</Badge>{deal.channel && <Badge tone="info">{deal.channel}</Badge>}</div>
          {dateValue && <p className={`flex items-center gap-1.5 text-xs ${overdue ? 'font-medium text-red-500' : 'text-slate-500'}`}><CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />{deal.stage === 'Won' ? '成交日期' : '预计成交'}：{formatDate(dateValue)}{overdue && ' · 已逾期'}</p>}
          {deal.stage === 'Won' && deal.giftMonths > 0 && <p className="text-[11px] font-medium text-amber-700">含赠送 {deal.giftMonths} 个月</p>}
          {deal.stage !== 'Won' && deal.stage !== 'Lost' && <Button className="mt-0.5 w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => onConfirmWon(deal)} size="sm" type="button" variant="outline"><Trophy aria-hidden="true" />确认赢单</Button>}
        </CardContent></Card>
      })}
      {!isLoading && !error && stageDeals.length === 0 && <p className="rounded-md border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">暂无商机</p>}
      {hasNextPage && <div ref={loadMoreRef}><Button className="w-full" disabled={isFetchingNextPage} onClick={() => fetchNextPage()} size="sm" type="button" variant="outline">{isFetchingNextPage ? '正在加载' : '加载更多'}</Button></div>}
    </div>
  </section>
}

export default function DealsPage() {
  const isMobile = useIsMobile()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<DealStage | ''>('')
  const [page, setPage] = useState(1)
  const [dealToConfirm, setDealToConfirm] = useState<Deal | null>(null)
  const [dealToEdit, setDealToEdit] = useState<Deal | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const debouncedSearch = useDebouncedValue(search.trim())
  const { data, error, isLoading } = useDeals({ search: debouncedSearch, status: status || undefined, page, enabled: isMobile })
  const pipelineSummary = useDealPipelineSummary(debouncedSearch)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (searchParams.get('create') !== '1') return
    setCreateDialogOpen(true)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('create')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  const visibleStages = status ? [status] : dealStages
  const visibleSummary = pipelineSummary.data?.stages.filter((item) => visibleStages.includes(item.stage)) ?? []
  const visibleTotalAmountCents = visibleSummary.reduce((total, item) => total + item.totalAmountCents, 0)
  const deleteDeal = useMutation({
    mutationFn: (dealId: string) => apiFetch(`/api/deals/${dealId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['deals'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })])
      toast.success('商机已作废')
    },
    onError: (deleteError) => toast.error(deleteError instanceof Error ? deleteError.message : '商机作废失败'),
  })

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function updateStatus(value: DealStage | '') {
    setStatus(value)
    setPage(1)
  }

  function confirmDeleteDeal(deal: Deal) {
    if (!window.confirm(`确认作废“${deal.customerName}”的商机吗？此操作不会物理删除数据。`)) return
    deleteDeal.mutate(deal.id)
  }

  return (
    <section className={isMobile ? 'space-y-4' : 'flex h-[calc(100dvh-8rem)] min-h-0 flex-col gap-3 overflow-hidden'}>
      <div className="flex min-h-[3.25rem] shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <h1 className="mr-1 text-lg font-semibold tracking-tight text-slate-900">商机看板</h1>
        <span className="hidden text-xs text-slate-400 sm:inline">·</span>
        <span className="mr-auto text-sm font-semibold text-indigo-700">预计总额 {formatCents(visibleTotalAmountCents)}</span>
        <div className="relative w-full sm:w-52 lg:w-64">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-3.5 size-4 text-muted-foreground md:top-2" />
          <Input aria-label="搜索商机" className="h-11 bg-white pl-8 pr-11 text-sm md:h-8 md:pr-8" onChange={(event) => updateSearch(event.target.value)} placeholder="搜索客户名称" value={search} />
          {search && <Button aria-label="清空商机搜索" className="absolute right-0.5 top-0.5" onClick={() => updateSearch('')} size="icon-sm" type="button" variant="ghost"><X aria-hidden="true" /></Button>}
        </div>
        <select aria-label="商机阶段筛选" className="h-11 rounded-md border border-input bg-white px-2.5 text-sm md:h-8" onChange={(event) => updateStatus(event.target.value as DealStage | '')} value={status}>
          <option value="">全部阶段</option>
          {dealStages.map((stage) => <option key={stage} value={stage}>{dealStageLabels[stage]}</option>)}
        </select>
        <Button className="h-11 shadow-sm shadow-indigo-200 md:h-8" onClick={() => setCreateDialogOpen(true)} size="sm" type="button"><Plus aria-hidden="true" />新建商机</Button>
      </div>

      {isMobile && isLoading && <p className="flex-1 py-6 text-sm text-muted-foreground">正在加载商机数据...</p>}
      {isMobile && error && <p className="flex-1 py-6 text-sm text-destructive">{error.message}</p>}
      {!isMobile && pipelineSummary.isLoading && <p className="flex-1 py-6 text-sm text-muted-foreground">正在加载商机管道...</p>}
      {!isMobile && pipelineSummary.error && <p className="flex-1 py-6 text-sm text-destructive">{pipelineSummary.error.message}</p>}
      {pipelineSummary.data && !isMobile && <>
        <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-xl bg-slate-100/80 p-2 touch-pan-x md:snap-none">
          {visibleStages.map((stage) => <PipelineColumn deletePending={deleteDeal.isPending} key={stage} onConfirmWon={setDealToConfirm} onDelete={confirmDeleteDeal} onEdit={setDealToEdit} search={debouncedSearch} stage={stage} summary={pipelineSummary.data.stages.find((item) => item.stage === stage) ?? { stage, count: 0, totalAmountCents: 0 }} />)}
        </div>
      </>}
      {data && isMobile && <div className="space-y-3">
        <ul className="space-y-3">
          {data.data.map((deal) => {
            const dateValue = deal.expectedCloseDate
            const overdue = isOverdue(dateValue, deal.stage)
            return <li key={deal.id}><Card className="gap-0 py-0"><CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-bold text-slate-900">{deal.customerName}</h2><div className="mt-2 flex flex-wrap gap-1.5"><Badge tone={getDealStageTone(deal.stage)}>{dealStageLabels[deal.stage]}</Badge><Badge tone="neutral">{deal.productName}</Badge>{deal.channel && <Badge tone="info">{deal.channel}</Badge>}</div></div><div className="flex shrink-0"><Button aria-label={`编辑${deal.customerName}的商机`} onClick={() => setDealToEdit(deal)} size="icon-sm" type="button" variant="ghost"><Pencil aria-hidden="true" /></Button><Button aria-label={`作废${deal.customerName}的商机`} className="text-rose-600" disabled={deleteDeal.isPending} onClick={() => confirmDeleteDeal(deal)} size="icon-sm" type="button" variant="ghost"><Trash2 aria-hidden="true" /></Button></div></div>
              <div className="flex items-center gap-2 text-xl font-bold text-indigo-700"><CircleDollarSign aria-hidden="true" className="size-5 shrink-0" />{deal.originalPriceCents && deal.originalPriceCents > deal.amountCents && <span className="text-xs font-normal text-slate-400 line-through">{formatCents(deal.originalPriceCents)}</span>}{formatCents(deal.amountCents)}</div>
              {dateValue && <p className={`flex items-center gap-1.5 text-sm ${overdue ? 'font-medium text-red-500' : 'text-slate-500'}`}><CalendarDays aria-hidden="true" className="size-4 shrink-0" />{deal.stage === 'Won' ? '成交日期' : '预计成交'}：{formatDate(dateValue)}{overdue && ' · 已逾期'}</p>}
              {deal.stage !== 'Won' && deal.stage !== 'Lost' && <Button className="w-full border-indigo-200 text-indigo-700" onClick={() => setDealToConfirm(deal)} type="button" variant="outline"><Trophy aria-hidden="true" />确认赢单</Button>}
            </CardContent></Card></li>
          })}
          {data.data.length === 0 && <li className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-muted-foreground">未找到匹配的商机</li>}
        </ul>
        <div className="rounded-lg border border-slate-200 bg-white"><PaginationControls onPageChange={setPage} page={data.page} total={data.total} totalPages={data.totalPages} /></div>
      </div>}

      <SaaSDealWonModal deal={dealToConfirm} onOpenChange={(open) => !open && setDealToConfirm(null)} />
      <DealDetailModal deal={dealToEdit} onOpenChange={(open) => !open && setDealToEdit(null)} />
      <CreateDealModal onOpenChange={setCreateDialogOpen} open={createDialogOpen} />
    </section>
  )
}
