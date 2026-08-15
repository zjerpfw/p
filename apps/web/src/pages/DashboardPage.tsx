// apps/web/src/pages/DashboardPage.tsx
import { differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { BarChart3, CircleAlert, CircleDollarSign, Lightbulb, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDashboard } from '@/hooks/useDashboard'
import { dealStages } from '@/hooks/useDeals'
import { dealStageLabels } from '@/lib/presentation'

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 0,
})

export default function DashboardPage() {
  const { data, error, isLoading } = useDashboard()
  const distribution = new Map(data?.stageDistribution.map((item) => [item.stage, item.count]))
  const maxCount = Math.max(1, ...dealStages.map((stage) => distribution.get(stage) ?? 0))

  if (isLoading) return <p className="text-sm text-muted-foreground">正在加载经营数据...</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">仪表盘</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data?.month} 销售经营概览</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="gap-0 rounded-lg py-0 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between px-5 py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">当月新增线索</CardTitle>
            <Lightbulb aria-hidden="true" className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5"><strong className="text-3xl">{data?.newLeads ?? 0}</strong><span className="ml-1 text-sm text-muted-foreground">个</span></CardContent>
        </Card>
        <Card className="gap-0 rounded-lg py-0 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between px-5 py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">当月赢单净利润</CardTitle>
            <CircleDollarSign aria-hidden="true" className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5"><strong className="text-3xl">{currency.format((data?.wonNetProfit ?? 0) / 100)}</strong></CardContent>
        </Card>
        <Card className="gap-0 rounded-lg py-0 shadow-none sm:col-span-2 xl:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between px-5 py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">在跟进商机</CardTitle>
            <Target aria-hidden="true" className="size-4 text-primary" />
          </CardHeader>
          <CardContent className="px-5 pb-5"><strong className="text-3xl">{dealStages.slice(0, 3).reduce((sum, stage) => sum + (distribution.get(stage) ?? 0), 0)}</strong><span className="ml-1 text-sm text-muted-foreground">个</span></CardContent>
        </Card>
      </div>

      <Card className="rounded-lg shadow-none">
        <CardHeader className="flex flex-row items-center gap-2">
          <BarChart3 aria-hidden="true" className="size-5 text-primary" />
          <CardTitle>商机漏斗分布</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {dealStages.map((stage) => {
            const count = distribution.get(stage) ?? 0
            return (
              <div className="grid grid-cols-[8rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm" key={stage}>
                <span className="truncate font-medium">{dealStageLabels[stage]}</span>
                <div aria-label={`${dealStageLabels[stage]}：${count} 个`} className="h-2 overflow-hidden rounded-sm bg-muted">
                  <div className="h-full rounded-sm bg-primary transition-[width]" style={{ width: `${(count / maxCount) * 100}%` }} />
                </div>
                <span className="text-right text-muted-foreground">{count}</span>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="gap-0 rounded-lg py-0 shadow-none">
        <CardHeader className="flex flex-row items-center gap-2 border-b border-border px-5 py-4">
          <CircleAlert aria-hidden="true" className="size-5 text-rose-600" />
          <CardTitle>近期待续费 SaaS 订单（60天内）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户名称</TableHead>
                <TableHead>到期时间</TableHead>
                <TableHead>剩余天数</TableHead>
                <TableHead className="text-right">历史成交金额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.renewalDeals.map((deal) => {
                const remainingDays = differenceInCalendarDays(new Date(deal.expireDate), startOfDay(new Date()))
                return (
                  <TableRow key={deal.id}>
                    <TableCell className="font-medium">{deal.customerName}</TableCell>
                    <TableCell>{format(new Date(deal.expireDate), 'yyyy-MM-dd')}</TableCell>
                    <TableCell><span className={remainingDays < 15 ? 'font-semibold text-destructive' : 'font-medium text-amber-700'}>{remainingDays} 天</span></TableCell>
                    <TableCell className="text-right">{currency.format(deal.amount)}</TableCell>
                  </TableRow>
                )
              })}
              {data?.renewalDeals.length === 0 && <TableRow><TableCell className="py-8 text-center text-muted-foreground" colSpan={4}>60 天内暂无待续费 SaaS 订单</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  )
}
