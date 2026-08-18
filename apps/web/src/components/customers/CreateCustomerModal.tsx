// apps/web/src/components/customers/CreateCustomerModal.tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiFetch } from '@/lib/api'

interface CreateCustomerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CreateCustomerPayload {
  name: string
  contact_phone: string
  status: string
  province: string
  city: string
  address: string
}

export function CreateCustomerModal({ open, onOpenChange }: CreateCustomerModalProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [status, setStatus] = useState('Active')
  const [province, setProvince] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')

  const createCustomer = useMutation({
    mutationFn: (payload: CreateCustomerPayload) =>
      apiFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      setName('')
      setContactPhone('')
      setStatus('Active')
      setProvince('')
      setCity('')
      setAddress('')
      onOpenChange(false)
      toast.success('客户已创建并归属到当前销售')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '新建客户失败')
    },
  })

  function submit() {
    if (!name.trim()) return
    createCustomer.mutate({
      name: name.trim(),
      contact_phone: contactPhone.trim(),
      status,
      province: province.trim(),
      city: city.trim(),
      address: address.trim(),
    })
  }

  const content = <>
        <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
          <DialogTitle>新建客户</DialogTitle>
          <DialogDescription>客户将自动归属到当前登录的销售人员。</DialogDescription>
        </DialogHeader>
        <form className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" onSubmit={(event) => { event.preventDefault(); submit() }}>
          <div className="space-y-4 rounded-lg bg-slate-50 p-4">
            <div className="space-y-1.5"><Label htmlFor="customer-name"><span className="text-rose-500">*</span> 客户名称</Label>
            <Input autoFocus id="customer-name" onChange={(event) => setName(event.target.value)} placeholder="请输入客户名称" value={name} />
            </div>
            <div className="space-y-1.5">
            <Label htmlFor="customer-phone">联系电话</Label>
            <Input id="customer-phone" inputMode="tel" onChange={(event) => setContactPhone(event.target.value)} placeholder="请输入联系电话" value={contactPhone} />
            </div>
            <div className="space-y-1.5">
            <Label htmlFor="customer-status">当前状态</Label>
            <select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm md:h-9" id="customer-status" onChange={(event) => setStatus(event.target.value)} value={status}>
              <option value="Active">活跃</option>
              <option value="Following">跟进中</option>
              <option value="Inactive">沉睡</option>
            </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="customer-province">省份</Label><Input id="customer-province" onChange={(event) => setProvince(event.target.value)} placeholder="例如：浙江省" value={province} /></div><div className="space-y-1.5"><Label htmlFor="customer-city">城市</Label><Input id="customer-city" onChange={(event) => setCity(event.target.value)} placeholder="例如：杭州市" value={city} /></div></div>
            <div className="space-y-1.5">
            <Label htmlFor="customer-address">公司地址</Label>
            <Input id="customer-address" onChange={(event) => setAddress(event.target.value)} placeholder="请输入详细地址" value={address} />
            </div>
          </div>
        </form>
        <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4">
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button>
          <Button disabled={!name.trim() || createCustomer.isPending} onClick={submit} type="button">
            {createCustomer.isPending ? '正在创建' : '保存客户'}
          </Button>
        </DialogFooter>
  </>

  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-y-auto p-0 sm:max-w-[600px]">{content}</DialogContent></Dialog>
}
