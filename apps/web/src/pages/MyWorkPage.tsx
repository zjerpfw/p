// apps/web/src/pages/MyWorkPage.tsx
// apps/web/src/pages/MyWorkPage.tsx
import { format, isToday, isPast } from 'date-fns'
import { CalendarCheck, Check, ClipboardList, MapPin, Pencil, Square } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EditTaskSheet, type EditableTask } from '@/components/customers/EditTaskSheet'
import { useActivities } from '@/hooks/useActivities'
import { useDeals } from '@/hooks/useDeals'
import { useTasks, type TaskStatus } from '@/hooks/useTasks'
import { apiFetch } from '@/lib/api'
import { activityTypeLabels, dealStageLabels, getDealStageTone } from '@/lib/presentation'

export default function MyWorkPage() {
  const activitiesQuery = useActivities()
  const dealsQuery = useDeals({ activeOnly: true, limit: 5 })
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('Open')
  const [taskFocus, setTaskFocus] = useState<'all' | 'overdue' | 'today' | 'upcoming'>('all')
  const tasksQuery = useTasks({ status: taskStatus, assigneeOnly: true, limit: 30 })
  const queryClient = useQueryClient()
  const [editingTask, setEditingTask] = useState<EditableTask | null>(null)
  const updateTaskStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) => apiFetch(`/api/tasks/${taskId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success(taskStatus === 'Open' ? '任务已完成' : '任务已重新打开')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '任务更新失败'),
  })
  const activities = activitiesQuery.data?.activities ?? []
  const todayCount = activities.filter((activity) => isToday(new Date(activity.createdAt))).length
  const allTasks = tasksQuery.data?.tasks ?? []
  const openTaskCounts = allTasks.reduce((counts, task) => {
    if (task.status !== 'Open') return counts
    const dueAt = new Date(task.dueAt)
    if (isPast(dueAt)) counts.overdue += 1
    else if (isToday(dueAt)) counts.today += 1
    else counts.upcoming += 1
    return counts
  }, { overdue: 0, today: 0, upcoming: 0 })
  const visibleTasks = allTasks.filter((task) => {
    if (taskStatus === 'Completed' || taskFocus === 'all') return true
    const dueAt = new Date(task.dueAt)
    if (taskFocus === 'overdue') return isPast(dueAt)
    if (taskFocus === 'today') return !isPast(dueAt) && isToday(dueAt)
    return !isPast(dueAt) && !isToday(dueAt)
  })

  function changeTaskStatus(status: TaskStatus) {
    setTaskStatus(status)
    if (status === 'Completed') setTaskFocus('all')
  }

  return (
    <section className="space-y-6">
      <div><p className="text-xs font-semibold text-indigo-600">销售执行</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">我的工作</h1><p className="mt-1 text-sm text-muted-foreground">查看本人近期跟进记录和需要推进的商机。</p></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="gap-0 py-0"><CardHeader className="flex flex-row items-center justify-between px-5 py-4"><CardTitle className="text-sm font-medium text-muted-foreground">今日跟进</CardTitle><CalendarCheck aria-hidden="true" className="size-4 text-emerald-600" /></CardHeader><CardContent className="px-5 pb-5"><strong className="text-3xl text-emerald-700">{todayCount}</strong><span className="ml-1 text-sm text-muted-foreground">条</span></CardContent></Card>
        <Card className="gap-0 py-0"><CardHeader className="flex flex-row items-center justify-between px-5 py-4"><CardTitle className="text-sm font-medium text-muted-foreground">待推进商机</CardTitle><ClipboardList aria-hidden="true" className="size-4 text-primary" /></CardHeader><CardContent className="px-5 pb-5"><strong className="text-3xl text-indigo-700">{dealsQuery.data?.total ?? 0}</strong><span className="ml-1 text-sm text-muted-foreground">个</span></CardContent></Card>
        <Card className="gap-0 py-0"><CardHeader className="flex flex-row items-center justify-between px-5 py-4"><CardTitle className="text-sm font-medium text-muted-foreground">待完成任务</CardTitle><ClipboardList aria-hidden="true" className="size-4 text-amber-600" /></CardHeader><CardContent className="px-5 pb-5"><strong className="text-3xl text-amber-700">{tasksQuery.data?.tasks.length ?? 0}</strong><span className="ml-1 text-sm text-muted-foreground">个</span></CardContent></Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="gap-0 py-0"><CardHeader className="border-b border-border px-5 py-4"><CardTitle>近期跟进</CardTitle></CardHeader><CardContent className="divide-y divide-border p-0">
          {activitiesQuery.isLoading && <p className="p-5 text-sm text-muted-foreground">正在加载跟进记录...</p>}
          {activitiesQuery.isError && <p className="p-5 text-sm text-destructive">跟进记录加载失败</p>}
          {activities.map((activity) => <Link className="block px-5 py-4 transition-colors hover:bg-muted/50" key={activity.id} to={`/customers/${activity.customerId}`}><div className="flex items-center justify-between gap-3"><p className="font-medium">{activity.customerName}</p><time className="shrink-0 text-xs text-muted-foreground">{format(new Date(activity.createdAt), 'MM-dd HH:mm')}</time></div><p className="mt-1 text-sm text-muted-foreground">{activityTypeLabels[activity.type]} · {activity.productName}</p>{activity.notes && <p className="mt-2 line-clamp-2 text-sm">{activity.notes}</p>}{activity.checkInAddress && <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin aria-hidden="true" className="size-3" />{activity.checkInAddress}</p>}</Link>)}
          {!activitiesQuery.isLoading && !activitiesQuery.isError && activities.length === 0 && <p className="p-5 text-sm text-muted-foreground">暂无跟进记录</p>}
        </CardContent></Card>
        <Card className="gap-0 py-0"><CardHeader className="space-y-3 border-b border-border px-5 py-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle>{taskStatus === 'Open' ? '待完成任务' : '已完成任务'}</CardTitle><div aria-label="任务状态" className="flex rounded-md border border-slate-200 bg-slate-50 p-1" role="tablist">{([{ value: 'Open', label: '待完成' }, { value: 'Completed', label: '已完成' }] as const).map((item) => <button aria-selected={taskStatus === item.value} className={`h-8 rounded px-3 text-xs font-medium transition-colors ${taskStatus === item.value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`} key={item.value} onClick={() => changeTaskStatus(item.value)} role="tab" type="button">{item.label}</button>)}</div></div>{taskStatus === 'Open' && <div aria-label="任务优先级" className="flex flex-wrap gap-2" role="tablist">{([{ value: 'all', label: '全部', count: allTasks.length }, { value: 'overdue', label: '已逾期', count: openTaskCounts.overdue }, { value: 'today', label: '今日截止', count: openTaskCounts.today }, { value: 'upcoming', label: '后续', count: openTaskCounts.upcoming }] as const).map((item) => <button aria-selected={taskFocus === item.value} className={`h-7 rounded-md border px-2.5 text-xs font-medium transition-colors ${taskFocus === item.value ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'}`} key={item.value} onClick={() => setTaskFocus(item.value)} role="tab" type="button">{item.label} {item.count}</button>)}</div>}</CardHeader><CardContent className="divide-y divide-border p-0">
          {tasksQuery.isLoading && <p className="p-5 text-sm text-muted-foreground">正在加载任务...</p>}
          {tasksQuery.isError && <p className="p-5 text-sm text-destructive">任务加载失败</p>}
          {visibleTasks.map((task) => { const overdue = task.status === 'Open' && isPast(new Date(task.dueAt)); return <div className="flex items-start gap-3 px-5 py-4" key={task.id}><button aria-label={task.status === 'Open' ? `完成任务 ${task.title}` : `重新打开任务 ${task.title}`} className="mt-0.5 shrink-0 text-muted-foreground hover:text-emerald-600" disabled={updateTaskStatus.isPending} onClick={() => updateTaskStatus.mutate({ taskId: task.id, status: task.status === 'Open' ? 'Completed' : 'Open' })} type="button">{task.status === 'Open' ? <Square aria-hidden="true" className="size-4" /> : <Check aria-hidden="true" className="size-4 text-emerald-600" />}</button><Link className="min-w-0 flex-1 hover:text-primary" to={`/customers/${task.customerId}`}><p className={`font-medium ${task.status === 'Completed' ? 'text-muted-foreground line-through' : ''}`}>{task.title}</p><p className="mt-1 text-sm text-muted-foreground">{task.customerName}{task.dealProductName ? ` · ${task.dealProductName}` : ''}</p><p className={`mt-1 text-xs ${overdue ? 'font-medium text-rose-600' : 'text-muted-foreground'}`}>{task.status === 'Completed' ? `完成于 ${format(new Date(task.completedAt ?? task.updatedAt), 'MM-dd HH:mm')}` : overdue ? '已逾期 · ' : '截止 '}{task.status === 'Open' && `${format(new Date(task.dueAt), 'MM-dd HH:mm')}${task.priority === 'High' ? ' · 高优先级' : ''}`}</p></Link><Button aria-label={`编辑任务 ${task.title}`} onClick={() => setEditingTask(task)} size="icon-xs" type="button" variant="ghost"><Pencil aria-hidden="true" /></Button></div> })}
          {!tasksQuery.isLoading && !tasksQuery.isError && visibleTasks.length === 0 && <p className="p-5 text-sm text-muted-foreground">{taskStatus === 'Open' && taskFocus !== 'all' ? '当前优先队列暂无任务' : taskStatus === 'Open' ? '暂无待完成任务' : '暂无已完成任务'}</p>}
        </CardContent></Card>
        <Card className="gap-0 py-0"><CardHeader className="border-b border-border px-5 py-4"><CardTitle>待推进商机</CardTitle></CardHeader><CardContent className="divide-y divide-border p-0">
          {dealsQuery.isLoading && <p className="p-5 text-sm text-muted-foreground">正在加载商机...</p>}
          {dealsQuery.isError && <p className="p-5 text-sm text-destructive">商机加载失败</p>}
          {dealsQuery.data?.data.map((deal) => <Link className="block px-5 py-4 transition-colors hover:bg-muted/50" key={deal.id} to="/deals"><div className="flex items-center justify-between gap-3"><p className="font-medium">{deal.customerName}</p><Badge className="shrink-0" tone={getDealStageTone(deal.stage)}>{dealStageLabels[deal.stage]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">产品：{deal.productName}</p><p className="mt-2 text-xs text-muted-foreground">预计成交日：{format(new Date(deal.expectedCloseDate), 'yyyy-MM-dd')}</p></Link>)}
          {!dealsQuery.isLoading && !dealsQuery.isError && dealsQuery.data?.data.length === 0 && <p className="p-5 text-sm text-muted-foreground">暂无待推进商机</p>}
        </CardContent></Card>
      </div>
      <EditTaskSheet onOpenChange={(open) => { if (!open) setEditingTask(null) }} open={Boolean(editingTask)} task={editingTask} />
    </section>
  )
}
