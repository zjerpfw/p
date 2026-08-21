// apps/web/src/pages/NotificationsPage.tsx
import { format } from 'date-fns'
import { BellRing } from 'lucide-react'
import { useState } from 'react'
import { PaginationControls } from '@/components/PaginationControls'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { type NotificationStatus, type NotificationType, useNotifications } from '@/hooks/useNotifications'

const typeLabels: Record<NotificationType, string> = {
  RenewalReminder: '续费提醒',
  TaskUpcomingReminder: '高优先级预提醒',
  TaskDueReminder: '今日任务提醒',
  TaskOverdueReminder: '任务逾期提醒',
}

const statusLabels: Record<NotificationStatus, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  Pending: { label: '待发送', tone: 'warning' },
  Sent: { label: '已发送', tone: 'success' },
  Failed: { label: '发送失败', tone: 'danger' },
}

import { useIsMobile } from '@/hooks/use-mobile'

export default function NotificationsPage() {
  const isMobile = useIsMobile()
  const [type, setType] = useState<NotificationType | ''>('')
  const [status, setStatus] = useState<NotificationStatus | ''>('')
  const [page, setPage] = useState(1)
  const notificationsQuery = useNotifications({ type: type || undefined, status: status || undefined, page })

  function updateType(value: string) {
    setType(value as NotificationType | '')
    setPage(1)
  }

  function updateStatus(value: string) {
    setStatus(value as NotificationStatus | '')
    setPage(1)
  }

  if (notificationsQuery.isLoading) return <p className="py-10 text-center text-xs text-muted-foreground">正在加载通知发送记录...</p>
  if (notificationsQuery.isError) return <p className="py-10 text-center text-xs text-destructive">{notificationsQuery.error instanceof Error ? notificationsQuery.error.message : '通知发送记录加载失败'}</p>

  return (
    <section className="space-y-3.5 md:space-y-6 pb-8">
      {/* 桌面端大标题 */}
      <div className="hidden md:flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-indigo-600">系统运维</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <BellRing aria-hidden="true" className="size-6" />
            通知发送记录
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">查看企业微信续费与任务提醒的发送结果，失败记录保留用于排障。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="筛选通知类型" className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700" onChange={(event) => updateType(event.target.value)} value={type}>
            <option value="">全部通知类型</option>
            {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="筛选发送状态" className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700" onChange={(event) => updateStatus(event.target.value)} value={status}>
            <option value="">全部发送状态</option>
            {Object.entries(statusLabels).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          </select>
        </div>
      </div>

      {/* 移动端筛选器 */}
      {isMobile && (
        <div className="flex gap-2">
          <select aria-label="筛选通知类型" className="h-8.5 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 shadow-sm" onChange={(event) => updateType(event.target.value)} value={type}>
            <option value="">全部类型</option>
            {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="筛选发送状态" className="h-8.5 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 shadow-sm" onChange={(event) => updateStatus(event.target.value)} value={status}>
            <option value="">全部状态</option>
            {Object.entries(statusLabels).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
          </select>
        </div>
      )}

      {isMobile ? (
        <div className="space-y-2.5">
          {notificationsQuery.data?.notifications.map((notification) => (
            <Card className="gap-0 border-slate-200/80 bg-white py-0 shadow-sm" key={notification.id}>
              <CardContent className="p-3.5 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-xs text-slate-900">{typeLabels[notification.type]}</span>
                  <Badge tone={statusLabels[notification.status].tone} className="text-[10px]">
                    {statusLabels[notification.status].label}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-0.5">
                  <span>接收人: <strong className="text-slate-700">{notification.recipientName ?? notification.recipientUserId}</strong></span>
                  <span>{format(new Date(notification.createdAt), 'MM-dd HH:mm')}</span>
                </div>
                {notification.lastError && (
                  <p className="rounded bg-rose-50 p-2 text-[11px] text-rose-700 mt-1">
                    失败原因: {notification.lastError}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          {notificationsQuery.data?.notifications.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">暂无通知记录</p>
          )}
          <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <PaginationControls onPageChange={setPage} page={notificationsQuery.data?.page ?? page} total={notificationsQuery.data?.total ?? 0} totalPages={notificationsQuery.data?.totalPages ?? 1} />
          </div>
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>创建时间</TableHead>
                  <TableHead>通知类型</TableHead>
                  <TableHead>接收人</TableHead>
                  <TableHead>提醒日期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>发送时间</TableHead>
                  <TableHead>失败原因</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notificationsQuery.data?.notifications.map((notification) => (
                  <TableRow key={notification.id}>
                    <TableCell className="whitespace-nowrap text-slate-600">{format(new Date(notification.createdAt), 'yyyy-MM-dd HH:mm')}</TableCell>
                    <TableCell className="font-medium text-slate-800">{typeLabels[notification.type]}</TableCell>
                    <TableCell>{notification.recipientName ?? notification.recipientUserId}</TableCell>
                    <TableCell>{notification.reminderDate}</TableCell>
                    <TableCell><Badge tone={statusLabels[notification.status].tone}>{statusLabels[notification.status].label}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-slate-600">{notification.sentAt ? format(new Date(notification.sentAt), 'yyyy-MM-dd HH:mm') : '-'}</TableCell>
                    <TableCell className="max-w-sm whitespace-normal break-words text-sm text-rose-700">{notification.lastError ?? '-'}</TableCell>
                  </TableRow>
                ))}
                {notificationsQuery.data?.notifications.length === 0 && <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={7}>暂无通知发送记录</TableCell></TableRow>}
              </TableBody>
            </Table>
            <PaginationControls onPageChange={setPage} page={notificationsQuery.data?.page ?? page} total={notificationsQuery.data?.total ?? 0} totalPages={notificationsQuery.data?.totalPages ?? 1} />
          </CardContent>
        </Card>
      )}
    </section>
  )
}
