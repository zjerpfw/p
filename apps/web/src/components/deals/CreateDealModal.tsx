// apps/web/src/components/deals/CreateDealModal.tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCustomers } from '@/hooks/useCustomers'
import { apiFetch } from '@/lib/api'

interface CreateDealModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateDealModal({ open, onOpenChange }: CreateDealModalProps) {
  const queryClient = useQueryClient()
  const { data: customersData, isLoading: isLoadingCustomers } = useCustomers({ limit: 100 })
  const [customerId, setCustomerId] = useState('')
  const [productName, setProductName] = useState('')
  const [amount, setAmount] = useState('')
  const [channel, setChannel] = useState('')
  const [originalPrice, setOriginalPrice] = useState('')
  const [expectedCloseDate, setExpectedCloseDate] = useState('')

  const createDeal = useMutation({
    mutationFn: () => apiFetch('/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        product_name: productName.trim(),
        amount: Number(amount),
        channel: channel.trim(),
        original_price: originalPrice ? Number(originalPrice) : Number(amount),
        expected_close_date: expectedCloseDate,
      }),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['deals'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      setCustomerId('')
      setProductName('')
      setAmount('')
      setChannel('')
      setOriginalPrice('')
      setExpectedCloseDate('')
      onOpenChange(false)
      toast.success('商机已新建')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '商机新建失败'),
  })

  const isValidAmount = Number.isSafeInteger(Number(amount)) && Number(amount) >= 0

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建商机</DialogTitle>
          <DialogDescription>为客户创建包含意向产品与预计成交信息的商机。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="create-deal-customer">关联客户</Label>
            <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" disabled={isLoadingCustomers} id="create-deal-customer" onChange={(event) => setCustomerId(event.target.value)} value={customerId}>
              <option value="">{isLoadingCustomers ? '正在加载客户...' : '请选择客户'}</option>
              {customersData?.data.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="create-deal-product">意向产品 / 版本</Label><Input id="create-deal-product" onChange={(event) => setProductName(event.target.value)} placeholder="例如：旗舰版 CRM - 50 账号" value={productName} /></div>
          <div className="space-y-1.5"><Label htmlFor="create-deal-channel">渠道 / 来源</Label><Input id="create-deal-channel" list="deal-channel-options" onChange={(event) => setChannel(event.target.value)} placeholder="例如：直销、代理商、转介绍" value={channel} /><datalist id="deal-channel-options"><option value="直销" /><option value="代理商" /><option value="转介绍" /><option value="线上推广" /></datalist></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="create-deal-amount">预计金额（元）</Label><Input id="create-deal-amount" min="0" onChange={(event) => setAmount(event.target.value)} placeholder="0" type="number" value={amount} /></div>
            <div className="space-y-1.5"><Label htmlFor="create-deal-original-price">原价 / 刊例价（元）</Label><Input id="create-deal-original-price" min="0" onChange={(event) => setOriginalPrice(event.target.value)} placeholder="默认与预计金额一致" type="number" value={originalPrice} /></div>
            <div className="space-y-1.5"><Label htmlFor="create-deal-close-date">预计成交日</Label><Input id="create-deal-close-date" onChange={(event) => setExpectedCloseDate(event.target.value)} type="date" value={expectedCloseDate} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button>
          <Button disabled={!customerId || !productName.trim() || !isValidAmount || !expectedCloseDate || createDeal.isPending} onClick={() => createDeal.mutate()} type="button">{createDeal.isPending ? '正在新建' : '新建商机'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
