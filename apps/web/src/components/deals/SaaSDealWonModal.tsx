// apps/web/src/components/deals/SaaSDealWonModal.tsx
import { addMonths, addYears, format } from 'date-fns'
import { Minus, Plus, WalletCards } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Deal } from '@/hooks/useDeals'
import { useUsers } from '@/hooks/useUsers'
import { apiFetch } from '@/lib/api'
import { getUserRoleLabel } from '@/lib/presentation'

interface SplitDraft {
  key: string
  userId: string
  amount: number
}

interface WonDealPayload {
  product_name: string
  channel: string
  original_price: number
  start_date: string
  duration_years: number
  gift_months: number
  expire_date: string
  renewal_reminder_days: number
  software_cost: number
  tax_cost: number
  rebate_amount: number
  net_profit: number
  splits: Array<{ user_id: string; split_amount: number }>
}

interface SaaSDealWonModalProps {
  deal: Deal | null
  onOpenChange: (open: boolean) => void
}

function formatDateInput(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function today() {
  return formatDateInput(new Date())
}

function toInteger(value: string) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

export default function SaaSDealWonModal({ deal, onOpenChange }: SaaSDealWonModalProps) {
  const queryClient = useQueryClient()
  const { data: usersData, isLoading: isLoadingUsers } = useUsers()
  const [startDate, setStartDate] = useState(today)
  const [productName, setProductName] = useState('')
  const [channel, setChannel] = useState('')
  const [originalPrice, setOriginalPrice] = useState(0)
  const [durationYears, setDurationYears] = useState(1)
  const [giftMonths, setGiftMonths] = useState(0)
  const [reminderDays, setReminderDays] = useState(30)
  const [softwareCost, setSoftwareCost] = useState(0)
  const [taxCost, setTaxCost] = useState(0)
  const [rebateAmount, setRebateAmount] = useState(0)
  const [splits, setSplits] = useState<SplitDraft[]>([])

  useEffect(() => {
    if (!deal) return

    setStartDate(deal.startDate ? formatDateInput(new Date(deal.startDate)) : today())
    setProductName(deal.productName)
    setChannel(deal.channel ?? '')
    setOriginalPrice(deal.originalPrice ?? deal.amount)
    setDurationYears(deal.durationYears ?? 1)
    setGiftMonths(deal.giftMonths ?? 0)
    setReminderDays(deal.renewalReminderDays ?? 30)
    setSoftwareCost(deal.softwareCost ?? 0)
    setTaxCost(deal.taxCost ?? 0)
    setRebateAmount(deal.rebateAmount ?? 0)
    setSplits([])
  }, [deal])

  const expireDate = useMemo(() => {
    const parsed = new Date(`${startDate}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? '' : formatDateInput(addMonths(addYears(parsed, durationYears), giftMonths))
  }, [durationYears, giftMonths, startDate])

  const netProfit = deal ? deal.amount - softwareCost - taxCost - rebateAmount : 0
  const totalSplitAmount = splits.reduce((total, split) => total + split.amount, 0)
  const isSplitValid = totalSplitAmount <= netProfit && splits.every((split) => split.userId)

  const confirmWon = useMutation({
    mutationFn: (payload: WonDealPayload) => apiFetch(`/api/deals/${deal?.id}/won`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['deals'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        deal ? queryClient.invalidateQueries({ queryKey: ['customers', deal.customerId] }) : Promise.resolve(),
      ])
      onOpenChange(false)
      toast.success('商机已确认赢单')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '确认赢单失败'),
  })

  function updateSplit(key: string, patch: Partial<SplitDraft>) {
    setSplits((current) => current.map((split) => (split.key === key ? { ...split, ...patch } : split)))
  }

  function addSplit() {
    const firstAvailable = usersData?.users.find((user) => !splits.some((split) => split.userId === user.id))
    setSplits((current) => [...current, { key: crypto.randomUUID(), userId: firstAvailable?.id ?? '', amount: 0 }])
  }

  function submit() {
    if (!deal || !productName.trim() || !expireDate || !isSplitValid) return

    confirmWon.mutate({
      product_name: productName.trim(),
      channel: channel.trim(),
      original_price: originalPrice,
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
    })
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(deal)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>确认软件服务赢单成交</DialogTitle>
          <DialogDescription>{deal?.customerName} 的成交信息、服务期限和内部订单分成将在确认后生效。</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="won-product">正式购买产品 / 规格</Label><Input id="won-product" onChange={(event) => setProductName(event.target.value)} placeholder="例如：旗舰版 CRM - 50 账号" value={productName} /></div><div className="space-y-1.5"><Label htmlFor="won-channel">渠道 / 来源</Label><Input id="won-channel" list="won-channel-options" onChange={(event) => setChannel(event.target.value)} placeholder="例如：直销、代理商、转介绍" value={channel} /><datalist id="won-channel-options"><option value="直销" /><option value="代理商" /><option value="转介绍" /><option value="线上推广" /></datalist></div></div>
            <h3 className="text-sm font-semibold">服务时间</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5"><Label htmlFor="start-date">使用日期</Label><Input id="start-date" onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} /></div>
              <div className="space-y-1.5"><Label htmlFor="duration-years">使用年限</Label><Input id="duration-years" min="1" onChange={(event) => setDurationYears(Math.max(1, toInteger(event.target.value)))} type="number" value={durationYears} /></div>
              <div className="space-y-1.5"><Label htmlFor="gift-months">赠送时长（月）</Label><Input id="gift-months" min="0" onChange={(event) => setGiftMonths(toInteger(event.target.value))} type="number" value={giftMonths} /></div>
              <div className="space-y-1.5"><Label htmlFor="expire-date">到期时间</Label><Input id="expire-date" readOnly type="date" value={expireDate} /></div>
            </div>
            <div className="max-w-48 space-y-1.5"><Label htmlFor="reminder-days">提前提醒天数</Label><Input id="reminder-days" min="0" onChange={(event) => setReminderDays(toInteger(event.target.value))} type="number" value={reminderDays} /></div>
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <h3 className="text-sm font-semibold">财务信息</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="deal-amount">成交金额（分）</Label><Input disabled id="deal-amount" type="number" value={deal?.amount ?? 0} /></div>
              <div className="space-y-1.5"><Label htmlFor="won-original-price">原价 / 刊例价（元）</Label><Input id="won-original-price" min="0" onChange={(event) => setOriginalPrice(toInteger(event.target.value))} type="number" value={originalPrice} /></div>
              <div className="space-y-1.5"><Label htmlFor="software-cost">软件成本（分）</Label><Input id="software-cost" min="0" onChange={(event) => setSoftwareCost(toInteger(event.target.value))} type="number" value={softwareCost} /></div>
              <div className="space-y-1.5"><Label htmlFor="tax-cost">开票成本（分）</Label><Input id="tax-cost" min="0" onChange={(event) => setTaxCost(toInteger(event.target.value))} type="number" value={taxCost} /></div>
              <div className="space-y-1.5"><Label htmlFor="rebate-amount">返利（分）</Label><Input id="rebate-amount" min="0" onChange={(event) => setRebateAmount(toInteger(event.target.value))} type="number" value={rebateAmount} /></div>
            </div>
            <div className="flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950">
              <span className="flex items-center gap-2 text-sm font-medium"><WalletCards aria-hidden="true" className="size-4" />实际利润</span>
              <strong>{netProfit.toLocaleString('zh-CN')} 分</strong>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-5">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">订单分成</h3><Button disabled={isLoadingUsers} onClick={addSplit} size="sm" type="button" variant="outline"><Plus aria-hidden="true" />添加人员</Button></div>
            {splits.map((split, index) => (
              <div className="grid grid-cols-[minmax(0,1fr)_120px_auto] gap-2" key={split.key}>
                <select aria-label={`分成人员 ${index + 1}`} className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm" onChange={(event) => updateSplit(split.key, { userId: event.target.value })} value={split.userId}>
                  <option value="">选择内部人员</option>
                  {usersData?.users.map((user) => <option disabled={splits.some((item) => item.key !== split.key && item.userId === user.id)} key={user.id} value={user.id}>{user.name} · {getUserRoleLabel(user.role)}</option>)}
                </select>
                <Input aria-label={`分成金额 ${index + 1}`} min="0" onChange={(event) => updateSplit(split.key, { amount: toInteger(event.target.value) })} type="number" value={split.amount} />
                <Button aria-label={`移除分成 ${index + 1}`} onClick={() => setSplits((current) => current.filter((item) => item.key !== split.key))} size="icon" type="button" variant="ghost"><Minus aria-hidden="true" /></Button>
              </div>
            ))}
            {splits.length === 0 && <p className="text-sm text-muted-foreground">尚未配置内部人员分成。</p>}
            <p className={isSplitValid ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>已分成 {totalSplitAmount.toLocaleString('zh-CN')} 分，实际利润 {netProfit.toLocaleString('zh-CN')} 分。</p>
          </section>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button>
          <Button disabled={!deal || !productName.trim() || !expireDate || !isSplitValid || confirmWon.isPending} onClick={submit} type="button">{confirmWon.isPending ? '正在确认' : '确认赢单'}</Button>
        </DialogFooter>
        {confirmWon.error && <p className="text-sm text-destructive">{confirmWon.error.message}</p>}
      </DialogContent>
    </Dialog>
  )
}
