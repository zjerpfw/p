// apps/web/src/pages/DealsPage.tsx
import { format } from 'date-fns'
import { CalendarDays, CircleDollarSign, Pencil, Plus, Search, Trash2, Trophy, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PaginationControls } from '@/components/PaginationControls'
import SaaSDealWonModal from '@/components/deals/SaaSDealWonModal'
import { DealDetailModal } from '@/components/deals/DealDetailModal'
import { CreateDealModal } from '@/components/deals/CreateDealModal'
import { dealStages, type Deal, type DealStage, useDeals } from '@/hooks/useDeals'
import { dealStageLabels, getDealStageTone } from '@/lib/presentation'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { apiFetch } from '@/lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'

const stageStyle: Record<DealStage, string> = {
  Leads: 'bg-slate-400',
  Qualified: 'bg-sky-500',
  Proposal: 'bg-amber-500',
  Won: 'bg-emerald-500',
  Lost: 'bg-rose-500',
}

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 0,
})

export default function DealsPage() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<DealStage | ''>('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebouncedValue(search.trim())
  const { data, error, isLoading } = useDeals({ search: debouncedSearch, status: status || undefined, page })
  const [dealToConfirm, setDealToConfirm] = useState<Deal | null>(null)
  const [dealToEdit, setDealToEdit] = useState<Deal | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (searchParams.get('create') !== '1') return
    setCreateDialogOpen(true)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('create')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  const deleteDeal = useMutation({
    mutationFn: (dealId: string) => apiFetch(`/api/deals/${dealId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['deals'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })])
      toast.success('商机已作废')
    },
    onError: (deleteError) => toast.error(deleteError instanceof Error ? deleteError.message : '商机作废失败'),
  })

  function confirmDeleteDeal(deal: Deal) {
    if (!window.confirm(`确认作废“${deal.customerName}”的商机吗？此操作不会物理删除数据。`)) return
    deleteDeal.mutate(deal.id)
  }

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function updateStatus(value: DealStage | '') {
    setStatus(value)
    setPage(1)
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold text-indigo-600">销售漏斗</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">商机看板</h1><p className="mt-1 text-sm text-muted-foreground">按销售阶段跟踪每个商机的推进情况。</p></div>
        <Button className="shadow-sm shadow-indigo-200" onClick={() => setCreateDialogOpen(true)} type="button"><Plus aria-hidden="true" />新建商机</Button>
      </div>
      <Card className="gap-0 py-0"><CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-9 pr-9" onChange={(event) => updateSearch(event.target.value)} placeholder="搜索客户名称" value={search} />
          {search && <Button aria-label="清空商机搜索" className="absolute right-1 top-0.5" onClick={() => updateSearch('')} size="icon-sm" type="button" variant="ghost"><X aria-hidden="true" /></Button>}
        </div>
        <select aria-label="商机阶段筛选" className="h-9 rounded-md border border-input bg-background px-3 text-sm sm:w-44" onChange={(event) => updateStatus(event.target.value as DealStage | '')} value={status}>
          <option value="">全部阶段</option>
          {dealStages.map((stage) => <option key={stage} value={stage}>{dealStageLabels[stage]}</option>)}
        </select>
      </CardContent></Card>
      {isLoading && <p className="mt-6 text-sm text-muted-foreground">正在加载商机数据...</p>}
      {error && <p className="mt-6 text-sm text-destructive">{error.message}</p>}
      {data && (
        <div>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {dealStages.map((stage) => {
              const stageDeals = data.data.filter((deal) => deal.stage === stage)

              return (
                <section className="w-[18rem] shrink-0 rounded-lg border border-slate-200 bg-slate-100/80 p-3" key={stage}>
                  <header className="mb-3 flex items-center justify-between border-b border-slate-200 pb-3">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><span className={`size-2 rounded-full ${stageStyle[stage]}`} />{dealStageLabels[stage]}</h2>
                    <Badge tone={getDealStageTone(stage)}>{stageDeals.length}</Badge>
                  </header>
                  <div className="space-y-3">
                    {stageDeals.map((deal) => (
                      <Card className="gap-0 py-0 transition-all hover:-translate-y-0.5 hover:shadow-md" key={deal.id}>
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{deal.customerName}</p><p className="mt-1 truncate text-xs text-slate-500">产品：{deal.productName}</p>{deal.channel && <Badge className="mt-2" tone="info">渠道：{deal.channel}</Badge>}</div><div className="flex shrink-0 gap-0.5"><Button aria-label={`编辑${deal.customerName}的商机`} onClick={() => setDealToEdit(deal)} size="icon-xs" type="button" variant="ghost"><Pencil aria-hidden="true" /></Button><Button aria-label={`作废${deal.customerName}的商机`} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" disabled={deleteDeal.isPending} onClick={() => confirmDeleteDeal(deal)} size="icon-xs" type="button" variant="ghost"><Trash2 aria-hidden="true" /></Button></div></div>
                          <div className="flex items-center gap-1.5 text-base font-bold text-indigo-700">
                            <CircleDollarSign aria-hidden="true" className="size-4" />{deal.originalPrice && deal.originalPrice > deal.amount && <span className="text-xs font-normal text-slate-400 line-through">{currency.format(deal.originalPrice)}</span>}{currency.format(deal.amount)}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <CalendarDays aria-hidden="true" className="size-3.5" />预计成交：{format(new Date(deal.expectedCloseDate), 'yyyy-MM-dd')}
                          </div>
                          {deal.stage === 'Won' && deal.expireDate && (
                            <div className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                              <CalendarDays aria-hidden="true" className="size-3.5" />
                              到期日：{format(new Date(deal.expireDate), 'yyyy-MM-dd')}
                            </div>
                          )}
                          {deal.stage !== 'Won' && deal.stage !== 'Lost' && (
                            <Button className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => setDealToConfirm(deal)} size="sm" type="button" variant="outline">
                              <Trophy aria-hidden="true" />确认赢单
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
          <Card className="gap-0 py-0">
            <PaginationControls onPageChange={setPage} page={data.page} total={data.total} totalPages={data.totalPages} />
          </Card>
        </div>
      )}
      <SaaSDealWonModal deal={dealToConfirm} onOpenChange={(open) => !open && setDealToConfirm(null)} />
      <DealDetailModal deal={dealToEdit} onOpenChange={(open) => !open && setDealToEdit(null)} />
      <CreateDealModal onOpenChange={setCreateDialogOpen} open={createDialogOpen} />
    </section>
  )
}
