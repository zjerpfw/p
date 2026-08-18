// apps/web/src/components/customers/EditTaskSheet.tsx
import { useEffect, useState } from 'react'
import { ClipboardPenLine } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { customerDetailQueryKey } from '@/hooks/useCustomerDetail'
import { apiFetch } from '@/lib/api'

export interface EditableTask {
  id: string
  customerId: string
  title: string
  description: string | null
  dueAt: string
  priority: 'Low' | 'Normal' | 'High'
  status: 'Open' | 'Completed'
}

interface EditTaskSheetProps {
  task: EditableTask | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function toDateTimeLocal(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

export function EditTaskSheet({ task, open, onOpenChange }: EditTaskSheetProps) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [priority, setPriority] = useState<EditableTask['priority']>('Normal')
  const [status, setStatus] = useState<EditableTask['status']>('Open')

  useEffect(() => {
    if (!open || !task) return
    setTitle(task.title)
    setDescription(task.description ?? '')
    setDueAt(toDateTimeLocal(task.dueAt))
    setPriority(task.priority)
    setStatus(task.status)
  }, [open, task])

  const updateTask = useMutation({
    mutationFn: () => {
      if (!task) throw new Error('未选择任务')
      return apiFetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          due_at: new Date(dueAt).toISOString(),
          priority,
          status,
        }),
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(task?.customerId ?? '') }),
      ])
      toast.success(status === 'Completed' ? '任务已更新并完成' : '任务已更新')
      onOpenChange(false)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '任务更新失败'),
  })

  function saveTask() {
    if (!title.trim()) {
      toast.error('请填写任务标题')
      return
    }
    if (!dueAt) {
      toast.error('请选择截止时间')
      return
    }
    updateTask.mutate()
  }

  return <Sheet onOpenChange={onOpenChange} open={open}>
    <SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-lg">
      <SheetHeader className="border-b border-border px-5 py-5"><SheetTitle>编辑跟进任务</SheetTitle><SheetDescription>可调整截止时间、优先级和任务说明，也可重新打开已完成任务。</SheetDescription></SheetHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="space-y-2"><Label htmlFor="edit-task-title"><span className="text-rose-500">*</span> 任务标题</Label><Input id="edit-task-title" onChange={(event) => setTitle(event.target.value)} value={title} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="edit-task-due-at"><span className="text-rose-500">*</span> 截止时间</Label><Input id="edit-task-due-at" onChange={(event) => setDueAt(event.target.value)} type="datetime-local" value={dueAt} /></div><div className="space-y-2"><Label>优先级</Label><Select onValueChange={(value) => setPriority(value as EditableTask['priority'])} value={priority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="High">高</SelectItem><SelectItem value="Normal">普通</SelectItem><SelectItem value="Low">低</SelectItem></SelectContent></Select></div></div>
        <div className="space-y-2"><Label>任务状态</Label><Select onValueChange={(value) => setStatus(value as EditableTask['status'])} value={status}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Open">待完成</SelectItem><SelectItem value="Completed">已完成</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="edit-task-description">任务说明</Label><Textarea id="edit-task-description" onChange={(event) => setDescription(event.target.value)} placeholder="记录任务背景、客户要求或完成标准" value={description} /></div>
      </div>
      <SheetFooter className="border-t border-border bg-background px-5 py-4"><Button disabled={updateTask.isPending} onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={updateTask.isPending || !task} onClick={saveTask} type="button"><ClipboardPenLine aria-hidden="true" />{updateTask.isPending ? '正在保存' : '保存变更'}</Button></SheetFooter>
    </SheetContent>
  </Sheet>
}
