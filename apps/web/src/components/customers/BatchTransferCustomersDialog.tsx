// apps/web/src/components/customers/BatchTransferCustomersDialog.tsx
import { ArrowRightLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUsers } from '@/hooks/useUsers'
import { apiFetch } from '@/lib/api'

interface SelectedCustomer {
  id: string
  name: string
}

interface BatchTransferCustomersDialogProps {
  customers: SelectedCustomer[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onTransferred: () => void
}

interface TransferResponse {
  transferred: number
  unchanged: number
  owner: { id: string; name: string }
}

export function BatchTransferCustomersDialog({ customers, open, onOpenChange, onTransferred }: BatchTransferCustomersDialogProps) {
  const queryClient = useQueryClient()
  const [ownerId, setOwnerId] = useState('')
  const usersQuery = useUsers()
  const users = usersQuery.data?.users ?? []

  useEffect(() => {
    if (open) setOwnerId('')
  }, [open])

  const transferCustomers = useMutation({
    mutationFn: () => apiFetch<TransferResponse>('/api/customers/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_ids: customers.map((customer) => customer.id), owner_id: ownerId }),
    }),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['activities'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['finance'] }),
      ])
      onTransferred()
      onOpenChange(false)
      const unchangedSuffix = result.unchanged > 0 ? `，${result.unchanged} 位归属未变` : ''
      toast.success(`已将 ${result.transferred} 位客户转交给${result.owner.name}${unchangedSuffix}`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '批量转交客户失败'),
  })

  return <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-y-auto p-0 sm:max-w-[600px]">
      <DialogHeader className="border-b border-border px-5 py-5"><DialogTitle>批量转交客户</DialogTitle><DialogDescription>将转交已选择的 {customers.length} 位客户。历史商机、合同、任务与跟进记录会保持关联。</DialogDescription></DialogHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{customers.map((customer) => customer.name).join('、')}</div>
        <div className="space-y-2"><Label>新的客户负责人</Label><Select onValueChange={setOwnerId} value={ownerId}><SelectTrigger><SelectValue placeholder={usersQuery.isLoading ? '正在加载员工...' : '选择负责人'} /></SelectTrigger><SelectContent>{users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}{user.role === 'admin' ? ' · 管理员' : ''}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <DialogFooter className="shrink-0 border-t border-border bg-background px-5 py-4"><Button disabled={transferCustomers.isPending} onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={transferCustomers.isPending || customers.length === 0 || !ownerId} onClick={() => transferCustomers.mutate()} type="button"><ArrowRightLeft aria-hidden="true" />{transferCustomers.isPending ? '正在转交' : `转交 ${customers.length} 位客户`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
