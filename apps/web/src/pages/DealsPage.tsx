// apps/web/src/pages/DealsPage.tsx
import { format } from 'date-fns'
import { CalendarDays, CircleDollarSign, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import SaaSDealWonModal from '@/components/deals/SaaSDealWonModal'
import { dealStages, type Deal, type DealStage, useDeals } from '@/hooks/useDeals'

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
  const { data, error, isLoading } = useDeals()
  const [dealToConfirm, setDealToConfirm] = useState<Deal | null>(null)

  return (
    <section>
      <h1 className="text-xl font-semibold">商机看板</h1>
      <p className="mt-1 text-sm text-muted-foreground">按销售阶段跟踪每个商机的推进情况。</p>
      {isLoading && <p className="mt-6 text-sm text-muted-foreground">正在加载商机数据...</p>}
      {error && <p className="mt-6 text-sm text-destructive">{error.message}</p>}
      {data && (
      <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
        {dealStages.map((stage) => {
          const stageDeals = data.deals.filter((deal) => deal.stage === stage)

          return (
            <section className="w-72 shrink-0" key={stage}>
              <header className={`border-l-4 ${stageStyle[stage]} mb-3 flex items-center justify-between bg-muted px-3 py-2`}>
                <h2 className="text-sm font-semibold">{stage}</h2>
                <span className="text-xs text-muted-foreground">{stageDeals.length}</span>
              </header>
              <div className="space-y-3">
                {stageDeals.map((deal) => (
                  <Card className="gap-0 rounded-lg py-0 shadow-none" key={deal.id}>
                    <CardContent className="space-y-3 p-4">
                      <p className="font-medium">{deal.customerName}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CircleDollarSign aria-hidden="true" className="size-4" />
                        {currency.format(deal.amount)}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarDays aria-hidden="true" className="size-4" />
                        预计 {format(new Date(deal.expectedCloseDate), 'yyyy-MM-dd')}
                      </div>
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
      )}
      <SaaSDealWonModal deal={dealToConfirm} onOpenChange={(open) => !open && setDealToConfirm(null)} />
    </section>
  )
}
