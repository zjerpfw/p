// apps/web/src/components/customers/DirectWonCustomerModal.tsx
import { addMonths, addYears, format } from 'date-fns'
import { Minus, Plus, WalletCards } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUsers } from '@/hooks/useUsers'
import { apiFetch } from '@/lib/api'
import { getUserRoleLabel } from '@/lib/presentation'

interface DirectWonCustomerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SplitDraft {
  key: string
  userId: string
  amount: number
}

function today() {
  return format(new Date(), 'yyyy-MM-dd')
}

function toInteger(value: string) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

export function DirectWonCustomerModal({ open, onOpenChange }: DirectWonCustomerModalProps) {
  const queryClient = useQueryClient()
  const { data: usersData, isLoading: isLoadingUsers } = useUsers()
  const [name, setName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [address, setAddress] = useState('')
  const [productName, setProductName] = useState('')
  const [amount, setAmount] = useState(0)
  const [startDate, setStartDate] = useState(today)
  const [durationYears, setDurationYears] = useState(1)
  const [giftMonths, setGiftMonths] = useState(0)
  const [reminderDays, setReminderDays] = useState(30)
  const [softwareCost, setSoftwareCost] = useState(0)
  const [taxCost, setTaxCost] = useState(0)
  const [rebateAmount, setRebateAmount] = useState(0)
  const [splits, setSplits] = useState<SplitDraft[]>([])

  useEffect(() => {
    if (!open) return
    setStartDate(today())
  }, [open])

  const expireDate = useMemo(() => {
    const parsed = new Date(`${startDate}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? '' : format(addMonths(addYears(parsed, durationYears), giftMonths), 'yyyy-MM-dd')
  }, [durationYears, giftMonths, startDate])
  const netProfit = amount - softwareCost - taxCost - rebateAmount
  const totalSplitAmount = splits.reduce((total, split) => total + split.amount, 0)
  const isSplitValid = netProfit >= 0 && totalSplitAmount <= netProfit && splits.every((split) => split.userId)

  const directWon = useMutation({
    mutationFn: () => apiFetch('/api/customers/direct-won', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        contact_phone: contactPhone.trim(),
        address: address.trim(),
        product_name: productName.trim(),
        amount,
        start_date: startDate,
        duration_years: durationYears,
        gift_months: giftMonths,
        expire_date: expireDate,
        renewal_reminder_days: reminderDays,
        software_cost: softwareCost,
        tax_cost: taxCost,
        rebate_amount: rebateAmount,
        net_profit: netProfit,
        splits: splits.map((split) => ({ user_id: split.userId, split_amount: split.amount })),
      }),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['deals'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      setName('')
      setContactPhone('')
      setAddress('')
      setProductName('')
      setAmount(0)
      setDurationYears(1)
      setGiftMonths(0)
      setReminderDays(30)
      setSoftwareCost(0)
      setTaxCost(0)
      setRebateAmount(0)
      setSplits([])
      onOpenChange(false)
      toast.success('成交客户与 SaaS 订单已录入')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '成交客户录入失败'),
  })

  function updateSplit(key: string, patch: Partial<SplitDraft>) {
    setSplits((current) => current.map((split) => (split.key === key ? { ...split, ...patch } : split)))
  }

  function addSplit() {
    const firstAvailable = usersData?.users.find((user) => !splits.some((split) => split.userId === user.id))
    setSplits((current) => [...current, { key: crypto.randomUUID(), userId: firstAvailable?.id ?? '', amount: 0 }])
  }

  const canSubmit = name.trim() && productName.trim() && expireDate && netProfit >= 0 && isSplitValid

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>直接录入成交客户</DialogTitle>
          <DialogDescription>一次完成客户建档、SaaS 赢单、服务期限、利润核算与业绩分成。</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">客户资料</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="direct-won-name">客户名称</Label><Input autoFocus id="direct-won-name" onChange={(event) => setName(event.target.value)} placeholder="请输入客户名称" value={name} /></div>
              <div className="space-y-1.5"><Label htmlFor="direct-won-phone">联系电话</Label><Input id="direct-won-phone" inputMode="tel" onChange={(event) => setContactPhone(event.target.value)} placeholder="请输入联系电话" value={contactPhone} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="direct-won-address">详细地址</Label><Input id="direct-won-address" onChange={(event) => setAddress(event.target.value)} placeholder="请输入公司地址" value={address} /></div>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <h3 className="text-sm font-semibold">购买服务</h3>
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="direct-won-product">产品 / 版本</Label><Input id="direct-won-product" onChange={(event) => setProductName(event.target.value)} placeholder="例如：旗舰版 CRM - 50 账号" value={productName} /></div><div className="space-y-1.5"><Label htmlFor="direct-won-amount">成交金额（元）</Label><Input id="direct-won-amount" min="0" onChange={(event) => setAmount(toInteger(event.target.value))} type="number" value={amount} /></div></div>
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <h3 className="text-sm font-semibold">服务期限</h3>
            <div className="grid gap-3 sm:grid-cols-4"><div className="space-y-1.5"><Label htmlFor="direct-won-start">使用日期</Label><Input id="direct-won-start" onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></div><div className="space-y-1.5"><Label htmlFor="direct-won-duration">服务年限</Label><Input id="direct-won-duration" min="1" onChange={(event) => setDurationYears(Math.max(1, toInteger(event.target.value)))} type="number" value={durationYears} /></div><div className="space-y-1.5"><Label htmlFor="direct-won-gift-months">赠送时长（月）</Label><Input id="direct-won-gift-months" min="0" onChange={(event) => setGiftMonths(toInteger(event.target.value))} type="number" value={giftMonths} /></div><div className="space-y-1.5"><Label htmlFor="direct-won-expire">到期时间</Label><Input id="direct-won-expire" readOnly type="date" value={expireDate} /></div></div>
            <div className="max-w-48 space-y-1.5"><Label htmlFor="direct-won-reminder">提前提醒天数</Label><Input id="direct-won-reminder" min="0" onChange={(event) => setReminderDays(toInteger(event.target.value))} type="number" value={reminderDays} /></div>
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <h3 className="text-sm font-semibold">利润核算</h3>
            <div className="grid gap-3 sm:grid-cols-3"><div className="space-y-1.5"><Label htmlFor="direct-won-software">软件成本（分）</Label><Input id="direct-won-software" min="0" onChange={(event) => setSoftwareCost(toInteger(event.target.value))} type="number" value={softwareCost} /></div><div className="space-y-1.5"><Label htmlFor="direct-won-tax">开票成本（分）</Label><Input id="direct-won-tax" min="0" onChange={(event) => setTaxCost(toInteger(event.target.value))} type="number" value={taxCost} /></div><div className="space-y-1.5"><Label htmlFor="direct-won-rebate">返利（分）</Label><Input id="direct-won-rebate" min="0" onChange={(event) => setRebateAmount(toInteger(event.target.value))} type="number" value={rebateAmount} /></div></div>
            <div className={netProfit >= 0 ? 'flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950' : 'flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive'}><span className="flex items-center gap-2 text-sm font-medium"><WalletCards aria-hidden="true" className="size-4" />实际利润</span><strong>{netProfit.toLocaleString('zh-CN')} 分</strong></div>
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">业绩分成</h3><Button disabled={isLoadingUsers} onClick={addSplit} size="sm" type="button" variant="outline"><Plus aria-hidden="true" />添加人员</Button></div>
            {splits.map((split, index) => <div className="grid grid-cols-[minmax(0,1fr)_120px_auto] gap-2" key={split.key}><select aria-label={`分成人员 ${index + 1}`} className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm" onChange={(event) => updateSplit(split.key, { userId: event.target.value })} value={split.userId}><option value="">选择内部人员</option>{usersData?.users.map((user) => <option disabled={splits.some((item) => item.key !== split.key && item.userId === user.id)} key={user.id} value={user.id}>{user.name} · {getUserRoleLabel(user.role)}</option>)}</select><Input aria-label={`分成金额 ${index + 1}`} min="0" onChange={(event) => updateSplit(split.key, { amount: toInteger(event.target.value) })} type="number" value={split.amount} /><Button aria-label={`移除分成 ${index + 1}`} onClick={() => setSplits((current) => current.filter((item) => item.key !== split.key))} size="icon" type="button" variant="ghost"><Minus aria-hidden="true" /></Button></div>)}
            {splits.length === 0 && <p className="text-sm text-muted-foreground">尚未配置内部人员分成。</p>}
            <p className={isSplitValid ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>已分成 {totalSplitAmount.toLocaleString('zh-CN')} 分，实际利润 {netProfit.toLocaleString('zh-CN')} 分。</p>
          </section>
        </div>
        <DialogFooter><Button onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={!canSubmit || directWon.isPending} onClick={() => directWon.mutate()} type="button">{directWon.isPending ? '正在录入' : '确认录入成交客户'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
