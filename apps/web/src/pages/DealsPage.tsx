// apps/web/src/pages/DealsPage.tsx
import { format } from 'date-fns'
import { CalendarDays, CircleDollarSign, Pencil, Search, Trash2, Trophy, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { PaginationControls } from '@/components/PaginationControls'
import SaaSDealWonModal from '@/components/deals/SaaSDealWonModal'
import { DealDetailModal } from '@/components/deals/DealDetailModal'
import { dealStages, type Deal, type DealStage, useDeals } from '@/hooks/useDeals'
import { dealStageLabels } from '@/lib/presentation'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { apiFetch } from '@/lib/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

const stageStyle: Record<DealStage, string> = {
  Leads: 'border-slate-300',
  Qualified: 'border-cyan-500',
  Proposal: 'border-amber-500',
  Won: 'border-emerald-500',
  Lost: 'border-rose-500',
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
  const queryClient = useQueryClient()

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
    <section>
      <h1 className="text-xl font-semibold">商机看板</h1>
      <p className="mt-1 text-sm text-muted-foreground">按销售阶段跟踪每个商机的推进情况。</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-9 pr-9" onChange={(event) => updateSearch(event.target.value)} placeholder="搜索客户名称" value={search} />
          {search && <Button aria-label="清空商机搜索" className="absolute right-1 top-0.5" onClick={() => updateSearch('')} size="icon-sm" type="button" variant="ghost"><X aria-hidden="true" /></Button>}
        </div>
        <select aria-label="商机阶段筛选" className="h-9 rounded-md border border-input bg-background px-3 text-sm sm:w-44" onChange={(event) => updateStatus(event.target.value as DealStage | '')} value={status}>
          <option value="">全部阶段</option>
          {dealStages.map((stage) => <option key={stage} value={stage}>{dealStageLabels[stage]}</option>)}
        </select>
      </div>
      {isLoading && <p className="mt-6 text-sm text-muted-foreground">正在加载商机数据...</p>}
      {error && <p className="mt-6 text-sm text-destructive">{error.message}</p>}
      {data && (
        <div>
          <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
            {dealStages.map((stage) => {
              const stageDeals = data.data.filter((deal) => deal.stage === stage)

              return (
                <section className="w-72 shrink-0" key={stage}>
                  <header className={`border-l-4 ${stageStyle[stage]} mb-3 flex items-center justify-between bg-muted px-3 py-2`}>
                    <h2 className="text-sm font-semibold">{dealStageLabels[stage]}</h2>
                    <span className="text-xs text-muted-foreground">{stageDeals.length}</span>
                  </header>
                  <div className="space-y-3">
                    {stageDeals.map((deal) => (
                      <Card className="gap-0 rounded-lg py-0 shadow-none" key={deal.id}>
                        <CardContent className="space-y-3 p-4">
                      <p className="font-medium">{deal.customerName}</p>
                      <div className="flex justify-end gap-1">
                        <Button aria-label={`编辑${deal.customerName}的商机`} onClick={() => setDealToEdit(deal)} size="icon-sm" type="button" variant="ghost"><Pencil aria-hidden="true" /></Button>
                        <Button aria-label={`作废${deal.customerName}的商机`} disabled={deleteDeal.isPending} onClick={() => confirmDeleteDeal(deal)} size="icon-sm" type="button" variant="ghost"><Trash2 aria-hidden="true" /></Button>
                      </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CircleDollarSign aria-hidden="true" className="size-4" />
                            预计金额：{currency.format(deal.amount)}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CalendarDays aria-hidden="true" className="size-4" />
                            预计成交日：{format(new Date(deal.expectedCloseDate), 'yyyy-MM-dd')}
                          </div>
                          {deal.stage === 'Won' && deal.expireDate && (
                            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
                              <CalendarDays aria-hidden="true" className="size-3.5" />
                              到期日：{format(new Date(deal.expireDate), 'yyyy-MM-dd')}
                            </div>
                          )}
                          {deal.stage !== 'Won' && deal.stage !== 'Lost' && (
                            <Button className="w-full" onClick={() => setDealToConfirm(deal)} size="sm" type="button" variant="outline">
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
          <div className="mt-2 rounded-lg border border-border bg-card">
            <PaginationControls onPageChange={setPage} page={data.page} total={data.total} totalPages={data.totalPages} />
          </div>
        </div>
      )}
      <SaaSDealWonModal deal={dealToConfirm} onOpenChange={(open) => !open && setDealToConfirm(null)} />
      <DealDetailModal deal={dealToEdit} onOpenChange={(open) => !open && setDealToEdit(null)} />
    </section>
  )
}
