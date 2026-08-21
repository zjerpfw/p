// apps/web/src/pages/AuditLogsPage.tsx
import { format } from 'date-fns'
import { History } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PaginationControls } from '@/components/PaginationControls'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { type AuditAction, type AuditLog, useAuditLogs } from '@/hooks/useAuditLogs'

const entityLabels: Record<string, string> = {
  Customer: '客户',
  Deal: '商机',
  Contract: '合同',
  Payment: '回款',
  Invoice: '发票',
  Task: '任务',
  CustomerTag: '客户标签',
  Activity: '跟进',
}

const actionLabels: Record<AuditAction, string> = {
  Created: '新建',
  Updated: '更新',
  Deleted: '删除',
  Won: '赢单',
  Renewed: '续费',
  Transferred: '转交',
}

const actionTones: Record<AuditAction, 'default' | 'info' | 'warning' | 'success' | 'danger'> = {
  Created: 'success',
  Updated: 'info',
  Deleted: 'danger',
  Won: 'success',
  Renewed: 'warning',
  Transferred: 'warning',
}

function parseSnapshot(value: string | null) {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function valueLabel(value: unknown) {
  if (value === null) return '无'
  if (value instanceof Date) return format(value, 'yyyy-MM-dd')
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return format(new Date(value), 'yyyy-MM-dd')
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

function changeSummary(log: AuditLog) {
  const before = parseSnapshot(log.beforeValue)
  const after = parseSnapshot(log.afterValue)
  if (log.action === 'Transferred') {
    const previousOwner = before?.ownerName ?? before?.ownerId ?? '未分配'
    const nextOwner = after?.ownerName ?? after?.ownerId ?? '未分配'
    return `负责人: ${valueLabel(previousOwner)} -> ${valueLabel(nextOwner)}`
  }
  if (!before && !after) return '无字段快照'
  if (!before) return Object.entries(after ?? {}).filter(([key]) => !['id', 'createdAt', 'updatedAt'].includes(key)).slice(0, 3).map(([key, value]) => `${key}: ${valueLabel(value)}`).join('；') || '已创建'
  if (!after) return '已删除'
  const changed = Object.keys({ ...before, ...after })
    .filter((key) => !['id', 'createdAt', 'updatedAt'].includes(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .slice(0, 3)
    .map((key) => `${key}: ${valueLabel(before[key])} -> ${valueLabel(after[key])}`)
  return changed.join('；') || '资料已更新'
}

import { useIsMobile } from '@/hooks/use-mobile'

export default function AuditLogsPage() {
  const isMobile = useIsMobile()
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState<AuditAction | ''>('')
  const [page, setPage] = useState(1)
  const logsQuery = useAuditLogs({ entityType: entityType || undefined, action: action || undefined, page })

  function updateEntityType(value: string) {
    setEntityType(value)
    setPage(1)
  }

  function updateAction(value: string) {
    setAction(value as AuditAction | '')
    setPage(1)
  }

  if (logsQuery.isLoading) return <p className="py-10 text-center text-xs text-muted-foreground">正在加载操作日志...</p>
  if (logsQuery.isError) return <p className="py-10 text-center text-xs text-destructive">{logsQuery.error instanceof Error ? logsQuery.error.message : '操作日志加载失败'}</p>

  return (
    <section className="space-y-3.5 md:space-y-6 pb-8">
      {/* 桌面端大标题 */}
      <div className="hidden md:flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-indigo-600">组织与权限</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <History aria-hidden="true" className="size-6" />
            操作日志
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">查看关键客户、商机、合同、发票、回款和任务操作记录。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="筛选操作对象" className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700" onChange={(event) => updateEntityType(event.target.value)} value={entityType}>
            <option value="">全部对象</option>
            {Object.entries(entityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="筛选操作类型" className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700" onChange={(event) => updateAction(event.target.value)} value={action}>
            <option value="">全部操作</option>
            {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      {/* 移动端筛选栏 */}
      {isMobile && (
        <div className="flex gap-2">
          <select aria-label="筛选操作对象" className="h-8.5 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 shadow-sm" onChange={(event) => updateEntityType(event.target.value)} value={entityType}>
            <option value="">全部对象</option>
            {Object.entries(entityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="筛选操作类型" className="h-8.5 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 shadow-sm" onChange={(event) => updateAction(event.target.value)} value={action}>
            <option value="">全部操作</option>
            {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      )}

      {isMobile ? (
        <div className="space-y-2.5">
          {logsQuery.data?.logs.map((log) => (
            <Card className="gap-0 border-slate-200/80 bg-white py-0 shadow-sm" key={log.id}>
              <CardContent className="p-3.5 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-900">{log.actorName ?? '系统'}</span>
                    <Badge tone={actionTones[log.action]} className="text-[10px] px-1.5 py-0">
                      {actionLabels[log.action]}
                    </Badge>
                  </div>
                  <time className="text-[11px] text-muted-foreground">{format(new Date(log.createdAt), 'MM-dd HH:mm')}</time>
                </div>
                <div className="text-xs text-slate-700">
                  <span className="font-medium text-slate-900">{entityLabels[log.entityType] ?? log.entityType}: </span>
                  <span className="text-muted-foreground">{changeSummary(log)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
          {logsQuery.data?.logs.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">暂无操作日志</p>
          )}
          <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <PaginationControls onPageChange={setPage} page={logsQuery.data?.page ?? page} total={logsQuery.data?.total ?? 0} totalPages={logsQuery.data?.totalPages ?? 1} />
          </div>
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>操作者</TableHead>
                  <TableHead>对象</TableHead>
                  <TableHead>操作</TableHead>
                  <TableHead className="min-w-96">变更内容</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsQuery.data?.logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-slate-600">{format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm')}</TableCell>
                    <TableCell className="font-medium text-slate-800">{log.actorName ?? '系统'}</TableCell>
                    <TableCell>
                      <span className="text-slate-800">{entityLabels[log.entityType] ?? log.entityType}</span>
                      <span className="ml-2 font-mono text-xs text-slate-400">{log.entityId.slice(0, 8)}</span>
                    </TableCell>
                    <TableCell><Badge tone={actionTones[log.action]}>{actionLabels[log.action]}</Badge></TableCell>
                    <TableCell className="max-w-xl whitespace-normal text-sm leading-6 text-slate-600">{changeSummary(log)}</TableCell>
                  </TableRow>
                ))}
                {logsQuery.data?.logs.length === 0 && <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={5}>暂无操作日志</TableCell></TableRow>}
              </TableBody>
            </Table>
            <PaginationControls onPageChange={setPage} page={logsQuery.data?.page ?? page} total={logsQuery.data?.total ?? 0} totalPages={logsQuery.data?.totalPages ?? 1} />
          </CardContent>
        </Card>
      )}
    </section>
  )
}
