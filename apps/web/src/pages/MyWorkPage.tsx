// apps/web/src/pages/MyWorkPage.tsx
// apps/web/src/pages/MyWorkPage.tsx
import { format, isBefore, isToday, startOfDay } from 'date-fns'
import { CalendarCheck, Check, ClipboardList, MapPin, Pencil, Square } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EditTaskDialog, type EditableTask } from '@/components/customers/EditTaskDialog'
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
  const todayStart = startOfDay(new Date())
  const openTaskCounts = allTasks.reduce((counts, task) => {
    if (task.status !== 'Open') return counts
    const dueAt = new Date(task.dueAt)
    if (isBefore(dueAt, todayStart)) counts.overdue += 1
    else if (isToday(dueAt)) counts.today += 1
    else counts.upcoming += 1
    return counts
  }, { overdue: 0, today: 0, upcoming: 0 })
  const visibleTasks = allTasks.filter((task) => {
    if (taskStatus === 'Completed' || taskFocus === 'all') return true
    const dueAt = new Date(task.dueAt)
    if (taskFocus === 'overdue') return isBefore(dueAt, todayStart)
    if (taskFocus === 'today') return !isBefore(dueAt, todayStart) && isToday(dueAt)
    return !isBefore(dueAt, todayStart) && !isToday(dueAt)
  })

  function changeTaskStatus(status: TaskStatus) {
    setTaskStatus(status)
    if (status === 'Completed') setTaskFocus('all')
  }

  return (
    <section className="space-y-4 md:space-y-6">
      {/* 桌面端标题 */}
      <div className="hidden md:block">
        <p className="text-xs font-semibold text-indigo-600">销售执行</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">我的工作</h1>
        <p className="mt-1 text-sm text-muted-foreground">查看本人近期跟进记录和需要推进的商机。</p>
      </div>

      {/* 移动端紧凑 3 统计横幅 */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="gap-0 py-0 border-slate-200/80 shadow-sm">
          <CardContent className="p-2.5 text-center md:p-5 md:text-left">
            <p className="text-[11px] md:text-sm font-medium text-muted-foreground">今日跟进</p>
            <div className="mt-1 flex items-baseline justify-center md:justify-start gap-0.5">
              <strong className="text-xl md:text-3xl font-bold text-emerald-700">{todayCount}</strong>
              <span className="text-[10px] md:text-sm text-muted-foreground">条</span>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 border-slate-200/80 shadow-sm">
          <CardContent className="p-2.5 text-center md:p-5 md:text-left">
            <p className="text-[11px] md:text-sm font-medium text-muted-foreground">待推商机</p>
            <div className="mt-1 flex items-baseline justify-center md:justify-start gap-0.5">
              <strong className="text-xl md:text-3xl font-bold text-indigo-700">{dealsQuery.data?.total ?? 0}</strong>
              <span className="text-[10px] md:text-sm text-muted-foreground">个</span>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-0 border-slate-200/80 shadow-sm">
          <CardContent className="p-2.5 text-center md:p-5 md:text-left">
            <p className="text-[11px] md:text-sm font-medium text-muted-foreground">待办任务</p>
            <div className="mt-1 flex items-baseline justify-center md:justify-start gap-0.5">
              <strong className="text-xl md:text-3xl font-bold text-amber-700">{tasksQuery.data?.total ?? 0}</strong>
              <span className="text-[10px] md:text-sm text-muted-foreground">个</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:gap-6 xl:grid-cols-3">
        {/* 待办任务卡片 (移动端最核心操作区，排在首位) */}
        <Card className="gap-0 py-0 shadow-sm xl:col-span-2">
          <CardHeader className="space-y-2.5 border-b border-border p-3.5 md:px-5 md:py-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm md:text-base font-semibold text-slate-900">
                {taskStatus === 'Open' ? '待完成任务' : '已完成任务'}
              </CardTitle>
              <div aria-label="任务状态" className="flex rounded-md border border-slate-200 bg-slate-100/80 p-0.5" role="tablist">
                {([{ value: 'Open', label: '待完成' }, { value: 'Completed', label: '已完成' }] as const).map((item) => (
                  <button
                    aria-selected={taskStatus === item.value}
                    className={`h-7 rounded px-2.5 text-xs font-medium transition-colors ${
                      taskStatus === item.value
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    key={item.value}
                    onClick={() => changeTaskStatus(item.value)}
                    role="tab"
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {taskStatus === 'Open' && (
              <div className="flex overflow-x-auto gap-1.5 no-scrollbar py-0.5" role="tablist">
                {([
                  { value: 'all', label: '全部', count: allTasks.length },
                  { value: 'overdue', label: '已逾期', count: openTaskCounts.overdue },
                  { value: 'today', label: '今日截止', count: openTaskCounts.today },
                  { value: 'upcoming', label: '后续', count: openTaskCounts.upcoming },
                ] as const).map((item) => (
                  <button
                    aria-selected={taskFocus === item.value}
                    className={`shrink-0 h-6.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
                      taskFocus === item.value
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                    }`}
                    key={item.value}
                    onClick={() => setTaskFocus(item.value)}
                    role="tab"
                    type="button"
                  >
                    {item.label} ({item.count})
                  </button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {tasksQuery.isLoading && <p className="p-5 text-xs text-muted-foreground text-center">正在加载任务...</p>}
            {tasksQuery.isError && <p className="p-5 text-xs text-destructive text-center">任务加载失败</p>}
            {visibleTasks.map((task) => {
              const overdue = task.status === 'Open' && isBefore(new Date(task.dueAt), todayStart)
              return (
                <div className="flex items-start gap-3 p-3.5 md:px-5 md:py-4 transition-colors active:bg-slate-50" key={task.id}>
                  <button
                    aria-label={task.status === 'Open' ? `完成任务 ${task.title}` : `重新打开任务 ${task.title}`}
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-slate-300 hover:border-emerald-600 active:scale-95"
                    disabled={updateTaskStatus.isPending}
                    onClick={() => updateTaskStatus.mutate({ taskId: task.id, status: task.status === 'Open' ? 'Completed' : 'Open' })}
                    type="button"
                  >
                    {task.status === 'Open' ? (
                      <span className="size-2 rounded-sm bg-transparent" />
                    ) : (
                      <Check aria-hidden="true" className="size-4 text-emerald-600" />
                    )}
                  </button>
                  <Link className="min-w-0 flex-1" to={`/customers/${task.customerId}`}>
                    <p className={`font-semibold text-sm text-slate-900 leading-snug ${task.status === 'Completed' ? 'text-muted-foreground line-through' : ''}`}>
                      {task.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {task.customerName}{task.dealProductName ? ` · ${task.dealProductName}` : ''}
                    </p>
                    <p className={`mt-1 text-[11px] ${overdue ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>
                      {task.status === 'Completed'
                        ? `完成于 ${format(new Date(task.completedAt ?? task.updatedAt), 'MM-dd HH:mm')}`
                        : overdue
                        ? `⚠️ 已逾期 · 截止 ${format(new Date(task.dueAt), 'MM-dd HH:mm')}`
                        : `截止 ${format(new Date(task.dueAt), 'MM-dd HH:mm')}`}
                      {task.priority === 'High' && <span className="ml-1 text-rose-600 font-semibold">· 高优先级</span>}
                    </p>
                  </Link>
                  <Button aria-label={`编辑任务 ${task.title}`} onClick={() => setEditingTask(task)} size="icon-xs" type="button" variant="ghost">
                    <Pencil aria-hidden="true" className="size-3.5 text-slate-400" />
                  </Button>
                </div>
              )
            })}
            {!tasksQuery.isLoading && !tasksQuery.isError && visibleTasks.length === 0 && (
              <p className="p-6 text-center text-xs text-muted-foreground">
                {taskStatus === 'Open' && taskFocus !== 'all' ? '当前筛选暂无任务' : taskStatus === 'Open' ? '暂无待完成任务 👏' : '暂无已完成任务'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* 近期跟进 */}
        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="border-b border-border p-3.5 md:px-5 md:py-4">
            <CardTitle className="text-sm md:text-base font-semibold text-slate-900">近期跟进动态</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {activitiesQuery.isLoading && <p className="p-5 text-xs text-muted-foreground text-center">正在加载跟进记录...</p>}
            {activitiesQuery.isError && <p className="p-5 text-xs text-destructive text-center">跟进记录加载失败</p>}
            {activities.slice(0, 8).map((activity) => (
              <Link className="block p-3.5 md:px-5 md:py-4 transition-colors active:bg-slate-50" key={activity.id} to={`/customers/${activity.customerId}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-slate-900 truncate">{activity.customerName}</p>
                  <time className="shrink-0 text-[11px] text-muted-foreground">{format(new Date(activity.createdAt), 'MM-dd HH:mm')}</time>
                </div>
                <p className="mt-0.5 text-xs text-indigo-700 font-medium">{activityTypeLabels[activity.type]} {activity.productName ? `· ${activity.productName}` : ''}</p>
                {activity.notes && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{activity.notes}</p>}
                {activity.checkInAddress && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                    <MapPin aria-hidden="true" className="size-3 shrink-0 text-emerald-600" />
                    {activity.checkInAddress}
                  </p>
                )}
              </Link>
            ))}
            {!activitiesQuery.isLoading && !activitiesQuery.isError && activities.length === 0 && (
              <p className="p-6 text-center text-xs text-muted-foreground">暂无跟进记录</p>
            )}
          </CardContent>
        </Card>
      </div>

      <EditTaskDialog onOpenChange={(open) => { if (!open) setEditingTask(null) }} open={Boolean(editingTask)} task={editingTask} />
    </section>
  )
}
