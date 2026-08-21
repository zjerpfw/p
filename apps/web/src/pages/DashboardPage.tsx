// apps/web/src/pages/DashboardPage.tsx
import { differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { BarChart3, CircleAlert, CircleDollarSign, ClipboardList, Lightbulb, RefreshCw, Target, TrendingUp } from 'lucide-react'
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
import { RenewCustomerDialog, type RenewCustomerTarget } from '@/components/customers/RenewCustomerDialog'

const funnelColors = ['#64748b', '#0ea5e9', '#f59e0b', '#10b981', '#f43f5e']

function FunnelTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: { name: string; value: number } }> }) {
  if (!active || !payload?.[0]?.payload) return null
  const item = payload[0].payload
  return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"><p className="text-xs font-semibold text-slate-800">{item.name}</p><p className="mt-1 text-xs text-slate-500">商机数量：<span className="font-semibold text-indigo-700">{item.value} 个</span></p></div>
}

export default function DashboardPage() {
  const [renewTarget, setRenewTarget] = useState<RenewCustomerTarget | null>(null)
  const { data, error, isLoading, isRefetching, refetch } = useDashboard()
  const distribution = new Map(data?.stageDistribution.map((item) => [item.stage, item.count]))
  const maxCount = Math.max(1, ...dealStages.map((stage) => distribution.get(stage) ?? 0))

  function getLastFollowUpLabel(lastActivityAt: string | null) {
    if (!lastActivityAt) return '从未跟进'
    const days = Math.max(0, differenceInCalendarDays(startOfDay(new Date()), startOfDay(new Date(lastActivityAt))))
    return days === 0 ? '今日已跟进' : `${days} 天前跟进`
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">正在加载经营数据...</p>
  if (error) {
    return (
      <section className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
        <CircleAlert aria-hidden="true" className="size-7 text-destructive" />
        <div>
          <h1 className="text-base font-semibold text-slate-900">仪表盘数据暂时无法加载</h1>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        </div>
        <Button disabled={isRefetching} onClick={() => void refetch()} type="button" variant="outline">
          <RefreshCw aria-hidden="true" className={isRefetching ? 'animate-spin' : undefined} />
          重新加载
        </Button>
      </section>
    )
  }

  return (
    <section className="space-y-4 md:space-y-6">
      {/* 桌面端大标题 */}
      <div className="hidden md:flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-indigo-600">经营总览</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">仪表盘</h1>
          <p className="mt-1 text-sm text-muted-foreground">{data?.month} 销售经营概览</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <TrendingUp aria-hidden="true" className="size-4 text-emerald-600" />
          关键业务指标实时汇总
        </div>
      </div>

      {/* 移动端顶栏 */}
      <div className="flex md:hidden items-center justify-between gap-2 px-0.5">
        <p className="text-xs font-medium text-slate-500">
          📅 <span className="font-semibold text-slate-800">{data?.month}</span> 销售经营概览
        </p>
        <button
          onClick={() => void refetch()}
          disabled={isRefetching}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-indigo-600 active:bg-indigo-50"
          type="button"
        >
          <RefreshCw aria-hidden="true" className={`size-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 待办风险快捷预警条 (移动端优先展示) */}
      {((data?.staleFollowUpCount ?? 0) > 0 || (data?.taskSummary.overdueCount ?? 0) > 0) && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 shadow-sm">
          <div className="flex items-center gap-1.5 min-w-0">
            <CircleAlert className="size-4 shrink-0 text-amber-600" />
            <span className="truncate">
              {(data?.staleFollowUpCount ?? 0) > 0 && `${data?.staleFollowUpCount} 个客户超 7 天未跟进 `}
              {(data?.taskSummary.overdueCount ?? 0) > 0 && `· ${data?.taskSummary.overdueCount} 个任务逾期`}
            </span>
          </div>
          <Link to="/customers?follow_up=stale" className="shrink-0 font-semibold text-indigo-700 hover:underline">
            处理 &rarr;
          </Link>
        </div>
      )}

      {/* 核心 4 大 KPI 卡片: 移动端 2x2 网格，桌面端 4 列 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {/* 当月新增线索 */}
        <Card className="gap-0 border-slate-200/80 bg-white py-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 md:px-5 md:py-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">当月新增线索</CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Lightbulb aria-hidden="true" className="size-4" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:px-5 md:pb-5">
            <strong className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">{data?.newLeads ?? 0}</strong>
            <span className="ml-1 text-xs text-muted-foreground">个</span>
          </CardContent>
        </Card>

        {/* 当月赢单净利润 */}
        <Card className="gap-0 border-slate-200/80 bg-white py-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 md:px-5 md:py-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">当月赢单净利润</CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CircleDollarSign aria-hidden="true" className="size-4" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:px-5 md:pb-5">
            <strong className="text-xl md:text-3xl font-bold tracking-tight text-emerald-700">{formatCents(data?.wonNetProfitCents)}</strong>
          </CardContent>
        </Card>

        {/* 在跟进商机 */}
        <Card className="gap-0 border-slate-200/80 bg-white py-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 md:px-5 md:py-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">在跟进商机</CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Target aria-hidden="true" className="size-4" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:px-5 md:pb-5">
            <strong className="text-2xl md:text-3xl font-bold tracking-tight text-indigo-700">{dealStages.slice(0, 3).reduce((sum, stage) => sum + (distribution.get(stage) ?? 0), 0)}</strong>
            <span className="ml-1 text-xs text-muted-foreground">个</span>
          </CardContent>
        </Card>

        {/* 加权预测金额 */}
        <Card className="gap-0 border-slate-200/80 bg-white py-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 md:px-5 md:py-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">加权预测金额</CardTitle>
            <div className="flex size-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <TrendingUp aria-hidden="true" className="size-4" />
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 md:px-5 md:pb-5">
            <strong className="text-xl md:text-3xl font-bold tracking-tight text-purple-700">{formatCents(data?.weightedForecastCents)}</strong>
          </CardContent>
        </Card>
      </div>

      {/* 预测金额近 3 个月细分卡片 */}
      <Card className="gap-0 py-0 shadow-sm">
        <CardHeader className="px-4 py-3 md:px-5 md:py-4 border-b border-border">
          <CardTitle className="text-xs md:text-sm font-semibold text-slate-800">未来 3 个月业绩预测细分</CardTitle>
        </CardHeader>
        <CardContent className="p-3 md:p-5">
          <div className="grid grid-cols-3 gap-2">
            {data?.forecastByMonth.map((item) => (
              <div key={item.month} className="rounded-lg bg-slate-50 p-2 text-center md:text-left">
                <p className="text-[11px] text-muted-foreground font-medium">{item.isCurrentMonth ? '本月' : item.offset === 1 ? '下月' : '下下月'}</p>
                <p className="mt-0.5 text-xs md:text-sm font-bold text-slate-900 truncate">{formatCents(item.amountCents)}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{item.dealCount} 个商机</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 漏斗分布图 & 近期待续费 */}
      <div className="grid gap-4 md:gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="flex flex-row items-center gap-2 border-b border-border px-4 py-3 md:px-5 md:py-4">
            <BarChart3 aria-hidden="true" className="size-4 md:size-5 text-indigo-600" />
            <div>
              <CardTitle className="text-sm md:text-base">当前商机漏斗分布</CardTitle>
              <p className="text-[11px] md:text-xs text-muted-foreground">按阶段统计活跃商机数量</p>
            </div>
          </CardHeader>
          <CardContent className="h-[260px] md:h-[320px] p-2 pt-4 md:p-4 md:pt-6">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={data?.funnelDistribution ?? []} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 12 }}>
                <XAxis allowDecimals={false} axisLine={false} tickLine={false} type="number" />
                <YAxis axisLine={false} dataKey="name" tick={{ fill: '#475569', fontSize: 12 }} tickLine={false} type="category" width={76} />
                <Tooltip content={<FunnelTooltip />} cursor={{ fill: '#eef2ff' }} />
                <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                  {(data?.funnelDistribution ?? []).map((item, index) => (
                    <Cell fill={funnelColors[index] ?? '#6366f1'} key={item.stage} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 近期待续费 SaaS 订单 */}
        <Card className="gap-0 overflow-hidden py-0 shadow-sm">
          <CardHeader className="flex flex-row items-center gap-2 border-b border-border px-4 py-3 md:px-5 md:py-4">
            <CircleAlert aria-hidden="true" className="size-4 md:size-5 text-amber-600" />
            <CardTitle className="text-sm md:text-base">近期待续费 SaaS 订单（60天内）</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* 移动端卡片式展示 */}
            <div className="block md:hidden divide-y divide-border">
              {data?.renewalDeals.map((deal) => {
                const remainingDays = differenceInCalendarDays(new Date(deal.expireDate), startOfDay(new Date()))
                return (
                  <div key={deal.id} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm text-slate-900">{deal.customerName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{deal.productName}</p>
                      </div>
                      <Badge tone={remainingDays < 15 ? 'danger' : 'warning'}>
                        {remainingDays} 天到期
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="font-semibold text-slate-800">{formatCents(deal.amountCents)}</span>
                      <Button
                        className="h-7 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                        onClick={() => setRenewTarget({ customerId: deal.customerId, customerName: deal.customerName, currentExpireDate: deal.expireDate, productName: deal.productName, channel: deal.channel })}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        立即续费
                      </Button>
                    </div>
                  </div>
                )
              })}
              {data?.renewalDeals.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">60 天内暂无待续费订单</p>
              )}
            </div>

            {/* 桌面端表格展示 */}
            <div className="hidden md:block">
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
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 逾期应收 */}
      <Card className="gap-0 overflow-hidden py-0 shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 border-b border-border px-4 py-3 md:px-5 md:py-4">
          <CircleAlert aria-hidden="true" className="size-4 md:size-5 text-rose-600" />
          <div>
            <CardTitle className="text-sm md:text-base">逾期应收</CardTitle>
            <p className="text-[11px] md:text-xs text-muted-foreground">已到截止日且有未回款余额的合同</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* 移动端卡片列表 */}
          <div className="block md:hidden divide-y divide-border">
            {data?.overdueReceivables.map((contract) => (
              <div key={contract.id} className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm text-slate-900">{contract.customerName}</p>
                    <p className="text-xs text-muted-foreground">{contract.contractNumber} · {contract.title}</p>
                  </div>
                  <Badge tone="danger">逾期 {contract.overdueDays} 天</Badge>
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <div>
                    <span className="text-muted-foreground">待回款: </span>
                    <span className="font-semibold text-rose-700">{formatCents(contract.outstandingAmountCents)}</span>
                  </div>
                  <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                    <Link to={`/customers/${contract.customerId}#finance`}>查看账款</Link>
                  </Button>
                </div>
              </div>
            ))}
            {data?.overdueReceivables.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">暂无逾期应收合同</p>
            )}
          </div>

          {/* 桌面端表格 */}
          <div className="hidden md:block">
            <Table>
              <TableHeader><TableRow><TableHead>客户</TableHead><TableHead>合同</TableHead><TableHead>回款截止日</TableHead><TableHead>逾期天数</TableHead><TableHead className="text-right">待回款</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {data?.overdueReceivables.map((contract) => <TableRow key={contract.id}><TableCell className="font-medium">{contract.customerName}</TableCell><TableCell><p className="font-medium text-slate-800">{contract.contractNumber}</p><p className="mt-1 text-xs text-muted-foreground">{contract.title}</p></TableCell><TableCell>{format(new Date(contract.paymentDueAt), 'yyyy-MM-dd')}</TableCell><TableCell><Badge tone="danger">{contract.overdueDays} 天</Badge></TableCell><TableCell className="text-right font-semibold text-rose-700">{formatCents(contract.outstandingAmountCents)}</TableCell><TableCell className="text-right"><Button asChild size="sm" type="button" variant="ghost"><Link to={`/customers/${contract.customerId}#finance`}>查看账款</Link></Button></TableCell></TableRow>)}
                {data?.overdueReceivables.length === 0 && <TableRow><TableCell className="py-8 text-center text-muted-foreground" colSpan={6}>暂无逾期应收合同</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <RenewCustomerDialog onOpenChange={(open) => !open && setRenewTarget(null)} target={renewTarget} />
    </section>
  )
}
