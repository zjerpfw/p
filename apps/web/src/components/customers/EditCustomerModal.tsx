// apps/web/src/components/customers/EditCustomerModal.tsx
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Customer } from '@/hooks/useCustomers'
import { useUsers } from '@/hooks/useUsers'
import { apiFetch, getCurrentUserRole } from '@/lib/api'

interface EditCustomerModalProps {
  customer: Customer | null
  onOpenChange: (open: boolean) => void
}

export function EditCustomerModal({ customer, onOpenChange }: EditCustomerModalProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [status, setStatus] = useState('Active')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const isAdmin = getCurrentUserRole() === 'admin'
  const usersQuery = useUsers()
  const users = usersQuery.data?.users ?? []

  useEffect(() => {
    if (!customer) return
    setName(customer.name)
    setContactPhone(customer.contactPhone ?? '')
    setStatus(customer.status)
    setProvince(customer.province ?? '')
    setCity(customer.city ?? '')
    setAddress(customer.address ?? '')
    setOwnerId(customer.ownerId)
  }, [customer])

  const updateCustomer = useMutation({
    mutationFn: () => apiFetch(`/api/customers/${customer?.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contact_phone: contactPhone, status, province, city, address, ...(isAdmin ? { owner_id: ownerId } : {}) }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customers'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      if (customer) await queryClient.invalidateQueries({ queryKey: ['customers', customer.id] })
      onOpenChange(false)
      toast.success('客户资料已更新')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '客户资料更新失败'),
  })

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(customer)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑客户</DialogTitle>
          <DialogDescription>更新客户联系人、状态与公司地址。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="edit-customer-name">客户名称</Label><Input id="edit-customer-name" onChange={(event) => setName(event.target.value)} value={name} /></div>
          <div className="space-y-1.5"><Label htmlFor="edit-customer-phone">联系电话</Label><Input id="edit-customer-phone" inputMode="tel" onChange={(event) => setContactPhone(event.target.value)} value={contactPhone} /></div>
          <div className="space-y-1.5"><Label htmlFor="edit-customer-status">当前状态</Label><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" id="edit-customer-status" onChange={(event) => setStatus(event.target.value)} value={status}><option value="Active">活跃</option><option value="Following">跟进中</option><option value="Inactive">沉睡</option></select></div>
          {isAdmin && <div className="space-y-1.5"><Label htmlFor="edit-customer-owner">客户负责人</Label><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" id="edit-customer-owner" onChange={(event) => setOwnerId(event.target.value)} value={ownerId}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}{user.role === 'admin' ? ' · 管理员' : ''}</option>)}</select></div>}
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="edit-customer-province">省份</Label><Input id="edit-customer-province" onChange={(event) => setProvince(event.target.value)} value={province} /></div><div className="space-y-1.5"><Label htmlFor="edit-customer-city">城市</Label><Input id="edit-customer-city" onChange={(event) => setCity(event.target.value)} value={city} /></div></div>
          <div className="space-y-1.5"><Label htmlFor="edit-customer-address">公司地址</Label><Input id="edit-customer-address" onChange={(event) => setAddress(event.target.value)} value={address} /></div>
        </div>
        <DialogFooter><Button onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={!name.trim() || updateCustomer.isPending} onClick={() => updateCustomer.mutate()} type="button">{updateCustomer.isPending ? '正在保存' : '保存修改'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
