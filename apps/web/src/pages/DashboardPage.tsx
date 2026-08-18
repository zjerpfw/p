// apps/web/src/pages/DashboardPage.tsx
import { differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { BarChart3, CircleAlert, CircleDollarSign, ClipboardList, Lightbulb, Target, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDashboard } from '@/hooks/useDashboard'
import { dealStages } from '@/hooks/useDeals'
import { dealStageLabels } from '@/lib/presentation'
import { formatCents } from '@/lib/money'
import { RenewCustomerSheet, type RenewCustomerTarget } from '@/components/customers/RenewCustomerSheet'

const funnelColors = ['#64748b', '#0ea5e9', '#f59e0b', '#10b981', '#f43f5e']

function FunnelTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: { name: string; value: number } }> }) {
  if (!active || !payload?.[0]?.payload) return null
  const item = payload[0].payload
  return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"><p className="text-xs font-semibold text-slate-800">{item.name}</p><p className="mt-1 text-xs text-slate-500">商机数量：<span className="font-semibold text-indigo-700">{item.value} 个</span></p></div>
}

export default function DashboardPage() {
  const [renewTarget, setRenewTarget] = useState<RenewCustomerTarget | null>(null)
  const { data, error, isLoading } = useDashboard()
  const distribution = new Map(data?.stageDistribution.map((item) => [item.stage, item.count]))
  const maxCount = Math.max(1, ...dealStages.map((stage) => distribution.get(stage) ?? 0))

  if (isLoading) return <p className="text-sm text-muted-foreground">正在加载经营数据...</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold text-indigo-600">经营总览</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">仪表盘</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data?.month} 销售经营概览</p>
        </div><div className="flex items-center gap-2 text-sm text-slate-500"><TrendingUp aria-hidden="true" className="size-4 text-emerald-600" />关键业务指标实时汇总</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between px-5 py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">当月新增线索</CardTitle>
            <Lightbulb aria-hidden="true" className="size-4 text-amber-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5"><strong className="text-3xl text-slate-900">{data?.newLeads ?? 0}</strong><span className="ml-1 text-sm text-muted-foreground">个</span></CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between px-5 py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">当月赢单净利润</CardTitle>
            <CircleDollarSign aria-hidden="true" className="size-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="px-5 pb-5"><strong className="text-3xl text-emerald-700">{formatCents(data?.wonNetProfitCents)}</strong></CardContent>
        </Card>
        <Card className="gap-0 py-0 sm:col-span-2 xl:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between px-5 py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">在跟进商机</CardTitle>
            <Target aria-hidden="true" className="size-4 text-primary" />
          </CardHeader>
          <CardContent className="px-5 pb-5"><strong className="text-3xl text-indigo-700">{dealStages.slice(0, 3).reduce((sum, stage) => sum + (distribution.get(stage) ?? 0), 0)}</strong><span className="ml-1 text-sm text-muted-foreground">个</span></CardContent>
        </Card>
        <Card className="gap-0 py-0 sm:col-span-2 xl:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between px-5 py-4"><CardTitle className="text-sm font-medium text-muted-foreground">加权预测金额</CardTitle><Target aria-hidden="true" className="size-4 text-indigo-600" /></CardHeader>
          <CardContent className="px-5 pb-5"><strong className="text-3xl text-indigo-700">{formatCents(data?.weightedForecastCents)}</strong></CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between px-5 py-4"><CardTitle className="text-sm font-medium text-muted-foreground">待完成任务</CardTitle><ClipboardList aria-hidden="true" className="size-4 text-amber-600" /></CardHeader>
          <CardContent className="px-5 pb-5"><strong className="text-3xl text-amber-700">{data?.taskSummary.openCount ?? 0}</strong><span className="ml-1 text-sm text-muted-foreground">个</span></CardContent>
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between px-5 py-4"><CardTitle className="text-sm font-medium text-muted-foreground">逾期跟进任务</CardTitle><CircleAlert aria-hidden="true" className="size-4 text-rose-600" /></CardHeader>
          <CardContent className="px-5 pb-5"><strong className="text-3xl text-rose-700">{data?.taskSummary.overdueCount ?? 0}</strong><span className="ml-1 text-sm text-muted-foreground">个</span></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center gap-2 border-b border-border px-5 py-4">
          <BarChart3 aria-hidden="true" className="size-5 text-indigo-600" />
          <div><CardTitle>当前商机漏斗分布</CardTitle><p className="mt-1 text-xs text-muted-foreground">按阶段统计当前可跟进商机数量</p></div>
        </CardHeader>
        <CardContent className="h-[320px] p-4 pt-6">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={data?.funnelDistribution ?? []} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 12 }}>
              <XAxis allowDecimals={false} axisLine={false} tickLine={false} type="number" />
              <YAxis axisLine={false} dataKey="name" tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} type="category" width={76} />
              <Tooltip content={<FunnelTooltip />} cursor={{ fill: '#eef2ff' }} />
              <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                {(data?.funnelDistribution ?? []).map((item, index) => <Cell fill={funnelColors[index] ?? '#6366f1'} key={item.stage} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row items-center gap-2 border-b border-border px-5 py-4">
          <CircleAlert aria-hidden="true" className="size-5 text-rose-600" />
          <CardTitle>近期待续费 SaaS 订单（60天内）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客户名称</TableHead>
                <TableHead>产品版本</TableHead>
                <TableHead>到期时间</TableHead>
                <TableHead>剩余天数</TableHead>
                <TableHead className="text-right">历史成交金额</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.renewalDeals.map((deal) => {
                const remainingDays = differenceInCalendarDays(new Date(deal.expireDate), startOfDay(new Date()))
                return (
                  <TableRow key={deal.id}>
                    <TableCell className="font-medium">{deal.customerName}</TableCell>
                    <TableCell>{deal.productName}{deal.giftMonths > 0 && <span className="ml-1 text-xs font-medium text-amber-700">（含赠送 {deal.giftMonths} 个月）</span>}</TableCell>
                    <TableCell>{format(new Date(deal.expireDate), 'yyyy-MM-dd')}</TableCell>
                    <TableCell><Badge tone={remainingDays < 15 ? 'danger' : 'warning'}>{remainingDays} 天</Badge></TableCell>
                    <TableCell className="text-right">{formatCents(deal.amountCents)}</TableCell>
                    <TableCell className="text-right"><Button className="text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800" onClick={() => setRenewTarget({ customerId: deal.customerId, customerName: deal.customerName, currentExpireDate: deal.expireDate, productName: deal.productName, channel: deal.channel })} size="sm" type="button" variant="ghost">立即续费</Button></TableCell>
                  </TableRow>
                )
              })}
              {data?.renewalDeals.length === 0 && <TableRow><TableCell className="py-8 text-center text-muted-foreground" colSpan={6}>60 天内暂无待续费 SaaS 订单</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row items-center gap-2 border-b border-border px-5 py-4">
          <CircleAlert aria-hidden="true" className="size-5 text-rose-600" />
          <div><CardTitle>逾期应收</CardTitle><p className="mt-1 text-xs text-muted-foreground">仅统计已登记回款截止日、且尚有未回款余额的生效合同。</p></div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>客户</TableHead><TableHead>合同</TableHead><TableHead>回款截止日</TableHead><TableHead>逾期天数</TableHead><TableHead className="text-right">待回款</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
            <TableBody>
              {data?.overdueReceivables.map((contract) => <TableRow key={contract.id}><TableCell className="font-medium">{contract.customerName}</TableCell><TableCell><p className="font-medium text-slate-800">{contract.contractNumber}</p><p className="mt-1 text-xs text-muted-foreground">{contract.title}</p></TableCell><TableCell>{format(new Date(contract.paymentDueAt), 'yyyy-MM-dd')}</TableCell><TableCell><Badge tone="danger">{contract.overdueDays} 天</Badge></TableCell><TableCell className="text-right font-semibold text-rose-700">{formatCents(contract.outstandingAmountCents)}</TableCell><TableCell className="text-right"><Button asChild size="sm" type="button" variant="ghost"><Link to={`/customers/${contract.customerId}#finance`}>查看账款</Link></Button></TableCell></TableRow>)}
              {data?.overdueReceivables.length === 0 && <TableRow><TableCell className="py-8 text-center text-muted-foreground" colSpan={6}>暂无逾期应收合同</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row items-center gap-2 border-b border-border px-5 py-4">
          <CircleAlert aria-hidden="true" className="size-5 text-rose-600" />
          <div><CardTitle>逾期跟进任务</CardTitle><p className="mt-1 text-xs text-muted-foreground">按截止时间排序，优先处理最早逾期的客户事项。</p></div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>客户</TableHead><TableHead>任务</TableHead><TableHead>负责人</TableHead><TableHead>截止时间</TableHead><TableHead>逾期天数</TableHead></TableRow></TableHeader>
            <TableBody>
              {data?.overdueTasks.map((task) => <TableRow key={task.id}><TableCell className="font-medium"><Link className="hover:text-primary hover:underline" to={`/customers/${task.customerId}#tasks`}>{task.customerName}</Link></TableCell><TableCell><p className="font-medium text-slate-800">{task.title}</p>{task.priority === 'High' && <Badge className="mt-1" tone="danger">高优先级</Badge>}</TableCell><TableCell>{task.assigneeName}</TableCell><TableCell>{format(new Date(task.dueAt), 'yyyy-MM-dd HH:mm')}</TableCell><TableCell><Badge tone="danger">{task.overdueDays} 天</Badge></TableCell></TableRow>)}
              {data?.overdueTasks.length === 0 && <TableRow><TableCell className="py-8 text-center text-muted-foreground" colSpan={5}>暂无逾期跟进任务</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <RenewCustomerSheet onOpenChange={(open) => !open && setRenewTarget(null)} target={renewTarget} />
    </section>
  )
}
