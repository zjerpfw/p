// apps/web/src/components/customers/TaskSheet.tsx
import { useEffect, useState } from 'react'
import { ClipboardPlus } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type { Deal } from '@/hooks/useDeals'
import { customerDetailQueryKey } from '@/hooks/useCustomerDetail'
import { useUsers } from '@/hooks/useUsers'
import { apiFetch, getCurrentUserRole } from '@/lib/api'

interface TaskSheetProps {
  customerId: string
  deals: Array<Pick<Deal, 'id' | 'productName' | 'stage'>>
  open: boolean
  onOpenChange: (open: boolean) => void
}

function defaultDueAt() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

export function TaskSheet({ customerId, deals, open, onOpenChange }: TaskSheetProps) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState(defaultDueAt)
  const [priority, setPriority] = useState<'Low' | 'Normal' | 'High'>('Normal')
  const [dealId, setDealId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const isAdmin = getCurrentUserRole() === 'admin'
  const usersQuery = useUsers()
  const users = usersQuery.data?.users ?? []
  const createTask = useMutation({
    mutationFn: () => apiFetch(`/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, deal_id: dealId || null, title: title.trim(), description: description.trim(), due_at: new Date(dueAt).toISOString(), priority, ...(isAdmin && assigneeId ? { assignee_id: assigneeId } : {}) }),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(customerId) }),
      ])
      toast.success('任务已创建')
      onOpenChange(false)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '任务创建失败'),
  })

  useEffect(() => {
    if (!open) return
    setTitle(''); setDescription(''); setDueAt(defaultDueAt()); setPriority('Normal'); setDealId(''); setAssigneeId('')
  }, [open])

  return <Sheet onOpenChange={onOpenChange} open={open}>
    <SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-lg">
      <SheetHeader className="border-b border-border px-5 py-5"><SheetTitle>新建跟进任务</SheetTitle><SheetDescription>为客户安排下一步行动，任务会出现在“我的工作”。</SheetDescription></SheetHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="space-y-2"><Label htmlFor="task-title"><span className="text-rose-500">*</span> 任务标题</Label><Input id="task-title" onChange={(event) => setTitle(event.target.value)} placeholder="例如：电话确认采购预算" value={title} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="task-due-at"><span className="text-rose-500">*</span> 截止时间</Label><Input id="task-due-at" onChange={(event) => setDueAt(event.target.value)} type="datetime-local" value={dueAt} /></div><div className="space-y-2"><Label>优先级</Label><Select onValueChange={(value) => setPriority(value as typeof priority)} value={priority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="High">高</SelectItem><SelectItem value="Normal">普通</SelectItem><SelectItem value="Low">低</SelectItem></SelectContent></Select></div></div>
        {isAdmin && <div className="space-y-2"><Label>任务负责人</Label><Select onValueChange={(value) => setAssigneeId(value === '__self__' ? '' : value)} value={assigneeId || '__self__'}><SelectTrigger><SelectValue placeholder="默认指派给自己" /></SelectTrigger><SelectContent><SelectItem value="__self__">默认指派给自己</SelectItem>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}{user.role === 'admin' ? ' · 管理员' : ''}</SelectItem>)}</SelectContent></Select></div>}
        <div className="space-y-2"><Label>关联商机</Label><Select onValueChange={(value) => setDealId(value === 'none' ? '' : value)} value={dealId}><SelectTrigger><SelectValue placeholder="可选关联商机" /></SelectTrigger><SelectContent><SelectItem value="none">不关联商机</SelectItem>{deals.map((deal) => <SelectItem key={deal.id} value={deal.id}>{deal.productName}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="task-description">任务说明</Label><Textarea id="task-description" onChange={(event) => setDescription(event.target.value)} placeholder="记录任务背景、客户要求或完成标准" value={description} /></div>
      </div>
      <SheetFooter className="border-t border-border bg-background px-5 py-4"><Button onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={createTask.isPending || !title.trim() || !dueAt} onClick={() => createTask.mutate()} type="button"><ClipboardPlus aria-hidden="true" />{createTask.isPending ? '正在创建' : '创建任务'}</Button></SheetFooter>
    </SheetContent>
  </Sheet>
}
