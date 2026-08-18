// apps/web/src/pages/AuditLogsPage.tsx
import { format } from 'date-fns'
import { History } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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

export default function AuditLogsPage() {
  const [entityType, setEntityType] = useState('')
  const logsQuery = useAuditLogs(entityType || undefined)

  if (logsQuery.isLoading) return <p className="py-10 text-sm text-muted-foreground">正在加载操作日志...</p>
  if (logsQuery.isError) return <p className="py-10 text-sm text-destructive">{logsQuery.error instanceof Error ? logsQuery.error.message : '操作日志加载失败'}</p>

  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-indigo-600">组织与权限</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900"><History aria-hidden="true" className="size-6" />操作日志</h1><p className="mt-1 text-sm text-muted-foreground">查看关键客户、商机、合同、发票、回款和任务操作记录。</p></div><select aria-label="筛选操作对象" className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700" onChange={(event) => setEntityType(event.target.value)} value={entityType}><option value="">全部对象</option>{Object.entries(entityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <Card className="gap-0 overflow-hidden py-0"><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>时间</TableHead><TableHead>操作者</TableHead><TableHead>对象</TableHead><TableHead>操作</TableHead><TableHead className="min-w-96">变更内容</TableHead></TableRow></TableHeader><TableBody>
      {logsQuery.data?.logs.map((log) => <TableRow key={log.id}><TableCell className="text-slate-600">{format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm')}</TableCell><TableCell className="font-medium text-slate-800">{log.actorName ?? '系统'}</TableCell><TableCell><span className="text-slate-800">{entityLabels[log.entityType] ?? log.entityType}</span><span className="ml-2 font-mono text-xs text-slate-400">{log.entityId.slice(0, 8)}</span></TableCell><TableCell><Badge tone={actionTones[log.action]}>{actionLabels[log.action]}</Badge></TableCell><TableCell className="max-w-xl whitespace-normal text-sm leading-6 text-slate-600">{changeSummary(log)}</TableCell></TableRow>)}
      {logsQuery.data?.logs.length === 0 && <TableRow><TableCell className="py-10 text-center text-muted-foreground" colSpan={5}>暂无操作日志</TableCell></TableRow>}
    </TableBody></Table></CardContent></Card>
  </section>
}
