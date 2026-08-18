// apps/web/src/components/activities/EditActivityDialog.tsx
import { ClipboardPenLine } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { customerDetailQueryKey, type Activity } from '@/hooks/useCustomerDetail'
import type { Deal } from '@/hooks/useDeals'
import { apiFetch } from '@/lib/api'
import { activityTypeLabels, dealStageLabels } from '@/lib/presentation'

interface EditActivityDialogProps {
  activity: Activity | null
  customerId: string
  deals: Array<Pick<Deal, 'id' | 'stage' | 'productName'>>
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditActivityDialog({ activity, customerId, deals, open, onOpenChange }: EditActivityDialogProps) {
  const queryClient = useQueryClient()
  const [notes, setNotes] = useState('')
  const [type, setType] = useState<Activity['type']>('Meeting')
  const [dealId, setDealId] = useState('')

  useEffect(() => {
    if (!open || !activity) return
    setNotes(activity.notes ?? '')
    setType(activity.type)
    setDealId(activity.dealId ?? '')
  }, [open, activity])

  const updateActivity = useMutation({
    mutationFn: () => {
      if (!activity) throw new Error('未选择跟进记录')
      return apiFetch(`/api/activities/${activity.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, notes: notes.trim(), deal_id: dealId || null }),
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(customerId) }),
        queryClient.invalidateQueries({ queryKey: ['activities'] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
      ])
      toast.success('跟进记录已更新')
      onOpenChange(false)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '跟进记录更新失败'),
  })

  return <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
      <DialogHeader className="border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5"><DialogTitle>编辑跟进记录</DialogTitle><DialogDescription>可更正沟通内容、跟进方式和关联商机；历史定位保持不变。</DialogDescription></DialogHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
        <div className="space-y-2"><Label htmlFor="edit-activity-notes"><span className="text-rose-500">*</span> 详细沟通内容</Label><Textarea autoFocus id="edit-activity-notes" onChange={(event) => setNotes(event.target.value)} value={notes} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>跟进方式</Label><Select onValueChange={(value) => setType(value as Activity['type'])} value={type}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(activityTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>关联商机</Label><Select onValueChange={(value) => setDealId(value === 'none' ? '' : value)} value={dealId || 'none'}><SelectTrigger><SelectValue placeholder="客户级跟进" /></SelectTrigger><SelectContent><SelectItem value="none">不关联商机</SelectItem>{deals.map((deal) => <SelectItem key={deal.id} value={deal.id}>{dealStageLabels[deal.stage]} · {deal.productName}</SelectItem>)}</SelectContent></Select></div></div>
      </div>
      <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4"><Button disabled={updateActivity.isPending} onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={!notes.trim() || updateActivity.isPending || !activity} onClick={() => updateActivity.mutate()} type="button"><ClipboardPenLine aria-hidden="true" />{updateActivity.isPending ? '正在保存' : '保存变更'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
