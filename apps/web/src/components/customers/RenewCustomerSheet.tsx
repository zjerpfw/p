// apps/web/src/components/customers/RenewCustomerSheet.tsx
import { addYears, format, isBefore, startOfDay } from 'date-fns'
import { CalendarSync } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/useIsMobile'
import { apiFetch } from '@/lib/api'
import { yuanToCents } from '@/lib/money'

export interface RenewCustomerTarget {
  customerId: string
  customerName: string
  currentExpireDate: string
  productName: string
  channel?: string | null
}

interface RenewCustomerSheetProps {
  target: RenewCustomerTarget | null
  onOpenChange: (open: boolean) => void
}

const productOptions = ['云会计', '云进销存', '云财贸', '星辰', 'KIS专业版', '账无忧', '服务']

function getRenewalPreview(currentExpireDate: string, years: number) {
  const today = startOfDay(new Date())
  const currentDate = startOfDay(new Date(currentExpireDate))
  const isExpired = Number.isNaN(currentDate.getTime()) || isBefore(currentDate, today)
  const baseDate = isExpired ? today : currentDate
  return {
    isExpired,
    newExpireDate: addYears(baseDate, years),
    reason: isExpired ? '已逾期，按今日重新计算' : '按原到期日顺延',
  }
}

export function RenewCustomerSheet({ target, onOpenChange }: RenewCustomerSheetProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const [product, setProduct] = useState('')
  const [years, setYears] = useState(1)
  const [amount, setAmount] = useState('')
  const [channel, setChannel] = useState('')
  const renewalRequestId = useRef<string | null>(null)

  useEffect(() => {
    if (!target) return
    setProduct(target.productName)
    setChannel(target.channel ?? '')
    setYears(1)
    setAmount('')
    renewalRequestId.current = crypto.randomUUID()
  }, [target])

  const renewalPreview = useMemo(() => {
    if (!target || !Number.isSafeInteger(years) || years < 1) return null
    return getRenewalPreview(target.currentExpireDate, years)
  }, [target, years])
  const amountCents = yuanToCents(amount)
  const canSubmit = Boolean(target && product.trim() && amountCents !== null && amountCents > 0 && years >= 1 && years <= 20)

  const renewCustomer = useMutation({
    mutationFn: () => apiFetch(`/api/customers/${target?.customerId}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': renewalRequestId.current ?? (renewalRequestId.current = crypto.randomUUID()) },
      body: JSON.stringify({ amount_cents: amountCents, years, product: product.trim(), channel: channel.trim() }),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['deals'] }),
        target ? queryClient.invalidateQueries({ queryKey: ['customers', target.customerId] }) : Promise.resolve(),
      ])
      onOpenChange(false)
      renewalRequestId.current = null
      toast.success('续费成功，到期日已更新')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '续费失败，请重试'),
  })

  const content = <>
    <SheetHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
      <SheetTitle className="flex items-center gap-2"><CalendarSync aria-hidden="true" className="size-5 text-emerald-600" />一键续费</SheetTitle>
      <SheetDescription>生成一笔续费赢单，并同步更新客户当前 SaaS 到期日。</SheetDescription>
    </SheetHeader>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
      <section className="space-y-3 rounded-lg bg-slate-50 p-4">
        <div><p className="text-xs font-medium text-slate-500">客户名称</p><p className="mt-1 font-semibold text-slate-900">{target?.customerName}</p></div>
        <div><p className="text-xs font-medium text-slate-500">当前到期日</p><p className="mt-1 font-semibold text-slate-800">{target ? format(new Date(target.currentExpireDate), 'yyyy-MM-dd') : '-'}</p></div>
      </section>
      <div className="space-y-1.5"><Label htmlFor="renew-product"><span className="text-rose-500">*</span> 续费产品</Label><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm md:h-9" id="renew-product" onChange={(event) => setProduct(event.target.value)} value={product}>{!productOptions.includes(product) && product && <option value={product}>{product}</option>}{productOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      <div className="space-y-1.5"><Label htmlFor="renew-years"><span className="text-rose-500">*</span> 续费年限</Label><Input id="renew-years" max="20" min="1" onChange={(event) => setYears(Math.max(1, Math.min(20, Number.parseInt(event.target.value, 10) || 1)))} type="number" value={years} /></div>
      <div className="space-y-1.5"><Label htmlFor="renew-amount"><span className="text-rose-500">*</span> 续费成交金额（元）</Label><Input id="renew-amount" inputMode="decimal" min="0.01" onChange={(event) => setAmount(event.target.value)} placeholder="请输入本次续费金额" step="0.01" type="number" value={amount} /></div>
      <div className="space-y-1.5"><Label htmlFor="renew-channel">续费渠道</Label><Input id="renew-channel" list="renew-channel-options" onChange={(event) => setChannel(event.target.value)} placeholder="例如：直销、代理商、转介绍" value={channel} /><datalist id="renew-channel-options"><option value="直销" /><option value="代理商" /><option value="转介绍" /><option value="线上推广" /></datalist></div>
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold text-slate-500">续费日期预览</p>
        <p className="mt-3 text-sm text-slate-600">当前到期日：<span className="font-semibold text-slate-900">{target ? format(new Date(target.currentExpireDate), 'yyyy-MM-dd') : '-'}</span></p>
        <p className={`mt-2 text-base font-bold ${renewalPreview?.isExpired ? 'text-amber-700' : 'text-emerald-700'}`}>续费后新到期日：{renewalPreview ? format(renewalPreview.newExpireDate, 'yyyy-MM-dd') : '-'}{renewalPreview && <span className="ml-1 text-sm font-medium">（{renewalPreview.reason}）</span>}</p>
      </section>
    </div>
    <SheetFooter className="border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4"><Button onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button className="bg-emerald-600 hover:bg-emerald-700" disabled={!canSubmit || renewCustomer.isPending} onClick={() => renewCustomer.mutate()} type="button">{renewCustomer.isPending ? '正在续费' : '确认续费'}</Button></SheetFooter>
  </>

  if (isMobile) return <Sheet onOpenChange={onOpenChange} open={Boolean(target)}><SheetContent className="h-[92dvh] max-h-[92dvh] w-full gap-0 overflow-hidden rounded-t-2xl border-t p-0" side="bottom">{content}</SheetContent></Sheet>
  return <Sheet onOpenChange={onOpenChange} open={Boolean(target)}><SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-lg">{content}</SheetContent></Sheet>
}
