// apps/web/src/components/customers/BatchTaskSheet.tsx
import { ClipboardPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useUsers } from '@/hooks/useUsers'
import { apiFetch, getCurrentUserRole } from '@/lib/api'

interface SelectedCustomer { id: string; name: string }

interface BatchTaskSheetProps {
  customers: SelectedCustomer[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}

function defaultDueAt() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function BatchTaskSheet({ customers, open, onOpenChange, onCreated }: BatchTaskSheetProps) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState(defaultDueAt)
  const [priority, setPriority] = useState<'Low' | 'Normal' | 'High'>('Normal')
  const [assigneeId, setAssigneeId] = useState('')
  const isAdmin = getCurrentUserRole() === 'admin'
  const usersQuery = useUsers()
  const users = usersQuery.data?.users ?? []

  useEffect(() => {
    if (!open) return
    setTitle(''); setDescription(''); setDueAt(defaultDueAt()); setPriority('Normal'); setAssigneeId('')
  }, [open])

  const createTasks = useMutation({
    mutationFn: () => apiFetch<{ created: number }>('/api/tasks/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_ids: customers.map((customer) => customer.id), title: title.trim(), description: description.trim(), due_at: new Date(dueAt).toISOString(), priority, ...(isAdmin && assigneeId ? { assignee_id: assigneeId } : {}) }),
    }),
    onSuccess: async ({ created }) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['tasks'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })])
      toast.success(`已为 ${created} 位客户创建跟进任务`)
      onCreated()
      onOpenChange(false)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '批量创建任务失败'),
  })

  return <Sheet onOpenChange={onOpenChange} open={open}>
    <SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-lg">
      <SheetHeader className="border-b border-border px-5 py-5"><SheetTitle>批量创建跟进任务</SheetTitle><SheetDescription>将为已选择的 {customers.length} 位客户各创建一条相同的跟进任务。</SheetDescription></SheetHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{customers.map((customer) => customer.name).join('、')}</div>
        <div className="space-y-2"><Label htmlFor="batch-task-title"><span className="text-rose-500">*</span> 任务标题</Label><Input id="batch-task-title" onChange={(event) => setTitle(event.target.value)} placeholder="例如：本周联系客户确认下一步计划" value={title} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="batch-task-due-at"><span className="text-rose-500">*</span> 截止时间</Label><Input id="batch-task-due-at" onChange={(event) => setDueAt(event.target.value)} type="datetime-local" value={dueAt} /></div><div className="space-y-2"><Label>优先级</Label><Select onValueChange={(value) => setPriority(value as typeof priority)} value={priority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="High">高</SelectItem><SelectItem value="Normal">普通</SelectItem><SelectItem value="Low">低</SelectItem></SelectContent></Select></div></div>
        {isAdmin && <div className="space-y-2"><Label>任务负责人</Label><Select onValueChange={(value) => setAssigneeId(value === '__self__' ? '' : value)} value={assigneeId || '__self__'}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__self__">默认指派给自己</SelectItem>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}{user.role === 'admin' ? ' · 管理员' : ''}</SelectItem>)}</SelectContent></Select></div>}
        <div className="space-y-2"><Label htmlFor="batch-task-description">任务说明</Label><Textarea id="batch-task-description" onChange={(event) => setDescription(event.target.value)} placeholder="记录本轮统一跟进目标或沟通口径" value={description} /></div>
      </div>
      <SheetFooter className="border-t border-border bg-background px-5 py-4"><Button disabled={createTasks.isPending} onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={createTasks.isPending || customers.length === 0 || !title.trim() || !dueAt} onClick={() => createTasks.mutate()} type="button"><ClipboardPlus aria-hidden="true" />{createTasks.isPending ? '正在创建' : `创建 ${customers.length} 个任务`}</Button></SheetFooter>
    </SheetContent>
  </Sheet>
}
