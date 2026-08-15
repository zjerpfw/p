// apps/web/src/pages/MyWorkPage.tsx
// apps/web/src/pages/MyWorkPage.tsx
import { format, isToday } from 'date-fns'
import { CalendarCheck, ClipboardList, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useActivities } from '@/hooks/useActivities'
import { useDeals } from '@/hooks/useDeals'
import { activityTypeLabels, dealStageLabels } from '@/lib/presentation'

export default function MyWorkPage() {
  const activitiesQuery = useActivities()
  const dealsQuery = useDeals({ limit: 5 })
  const activities = activitiesQuery.data?.activities ?? []
  const todayCount = activities.filter((activity) => isToday(new Date(activity.createdAt))).length

  return (
    <section className="space-y-6">
      <div><h1 className="text-2xl font-semibold">我的工作</h1><p className="mt-1 text-sm text-muted-foreground">查看本人近期跟进记录和需要推进的商机。</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="gap-0 rounded-lg py-0 shadow-none"><CardHeader className="flex flex-row items-center justify-between px-5 py-4"><CardTitle className="text-sm font-medium text-muted-foreground">今日跟进</CardTitle><CalendarCheck aria-hidden="true" className="size-4 text-emerald-600" /></CardHeader><CardContent className="px-5 pb-5"><strong className="text-3xl">{todayCount}</strong><span className="ml-1 text-sm text-muted-foreground">条</span></CardContent></Card>
        <Card className="gap-0 rounded-lg py-0 shadow-none"><CardHeader className="flex flex-row items-center justify-between px-5 py-4"><CardTitle className="text-sm font-medium text-muted-foreground">待推进商机</CardTitle><ClipboardList aria-hidden="true" className="size-4 text-primary" /></CardHeader><CardContent className="px-5 pb-5"><strong className="text-3xl">{dealsQuery.data?.total ?? 0}</strong><span className="ml-1 text-sm text-muted-foreground">个</span></CardContent></Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="gap-0 rounded-lg py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4"><CardTitle>近期跟进</CardTitle></CardHeader><CardContent className="divide-y divide-border p-0">
          {activitiesQuery.isLoading && <p className="p-5 text-sm text-muted-foreground">正在加载跟进记录...</p>}
          {activitiesQuery.isError && <p className="p-5 text-sm text-destructive">跟进记录加载失败</p>}
          {activities.map((activity) => <Link className="block px-5 py-4 transition-colors hover:bg-muted/50" key={activity.id} to={`/customers/${activity.customerId}`}><div className="flex items-center justify-between gap-3"><p className="font-medium">{activity.customerName}</p><time className="shrink-0 text-xs text-muted-foreground">{format(new Date(activity.createdAt), 'MM-dd HH:mm')}</time></div><p className="mt-1 text-sm text-muted-foreground">{activityTypeLabels[activity.type]} · {activity.productName}</p>{activity.notes && <p className="mt-2 line-clamp-2 text-sm">{activity.notes}</p>}{activity.checkInAddress && <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin aria-hidden="true" className="size-3" />{activity.checkInAddress}</p>}</Link>)}
          {!activitiesQuery.isLoading && !activitiesQuery.isError && activities.length === 0 && <p className="p-5 text-sm text-muted-foreground">暂无跟进记录</p>}
        </CardContent></Card>
        <Card className="gap-0 rounded-lg py-0 shadow-none"><CardHeader className="border-b border-border px-5 py-4"><CardTitle>待推进商机</CardTitle></CardHeader><CardContent className="divide-y divide-border p-0">
          {dealsQuery.isLoading && <p className="p-5 text-sm text-muted-foreground">正在加载商机...</p>}
          {dealsQuery.isError && <p className="p-5 text-sm text-destructive">商机加载失败</p>}
          {dealsQuery.data?.data.map((deal) => <Link className="block px-5 py-4 transition-colors hover:bg-muted/50" key={deal.id} to="/deals"><div className="flex items-center justify-between gap-3"><p className="font-medium">{deal.customerName}</p><span className="shrink-0 text-xs text-muted-foreground">{dealStageLabels[deal.stage]}</span></div><p className="mt-1 text-sm text-muted-foreground">产品：{deal.productName}</p><p className="mt-2 text-xs text-muted-foreground">预计成交日：{format(new Date(deal.expectedCloseDate), 'yyyy-MM-dd')}</p></Link>)}
          {!dealsQuery.isLoading && !dealsQuery.isError && dealsQuery.data?.data.length === 0 && <p className="p-5 text-sm text-muted-foreground">暂无待推进商机</p>}
        </CardContent></Card>
      </div>
    </section>
  )
}
