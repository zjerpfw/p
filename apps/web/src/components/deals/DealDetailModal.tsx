// apps/web/src/components/deals/DealDetailModal.tsx
import { format } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { dealStages, type Deal, type DealStage } from '@/hooks/useDeals'
import { apiFetch } from '@/lib/api'
import { dealStageLabels } from '@/lib/presentation'

interface DealDetailModalProps {
  deal: Deal | null
  onOpenChange: (open: boolean) => void
}

function dateInput(value: string | null) {
  return value ? format(new Date(value), 'yyyy-MM-dd') : ''
}

function toNumber(value: string) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

export function DealDetailModal({ deal, onOpenChange }: DealDetailModalProps) {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState(0)
  const [productName, setProductName] = useState('')
  const [channel, setChannel] = useState('')
  const [originalPrice, setOriginalPrice] = useState(0)
  const [stage, setStage] = useState<DealStage>('Leads')
  const [expectedCloseDate, setExpectedCloseDate] = useState('')
  const [softwareCost, setSoftwareCost] = useState(0)
  const [taxCost, setTaxCost] = useState(0)
  const [rebateAmount, setRebateAmount] = useState(0)
  const [netProfit, setNetProfit] = useState(0)

  useEffect(() => {
    if (!deal) return
    setAmount(deal.amount)
    setProductName(deal.productName)
    setChannel(deal.channel ?? '')
    setOriginalPrice(deal.originalPrice ?? deal.amount)
    setStage(deal.stage)
    setExpectedCloseDate(dateInput(deal.expectedCloseDate))
    setSoftwareCost(deal.softwareCost ?? 0)
    setTaxCost(deal.taxCost ?? 0)
    setRebateAmount(deal.rebateAmount ?? 0)
    setNetProfit(deal.netProfit ?? 0)
  }, [deal])

  const calculatedNetProfit = useMemo(() => amount - softwareCost - taxCost - rebateAmount, [amount, softwareCost, taxCost, rebateAmount])
  const updateDeal = useMutation({
    mutationFn: () => apiFetch(`/api/deals/${deal?.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        product_name: productName,
        channel: channel.trim(),
        original_price: originalPrice,
        stage,
        expected_close_date: expectedCloseDate,
        ...(stage === 'Won' ? {
          software_cost: softwareCost,
          tax_cost: taxCost,
          rebate_amount: rebateAmount,
          net_profit: netProfit,
        } : {}),
      }),
    }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['deals'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })])
      onOpenChange(false)
      toast.success('商机资料已更新')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '商机资料更新失败'),
  })

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(deal)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>编辑商机</DialogTitle><DialogDescription>{deal?.customerName} 的商机资料与服务财务信息。</DialogDescription></DialogHeader>
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="deal-edit-product">意向产品 / 版本</Label><Input id="deal-edit-product" onChange={(event) => setProductName(event.target.value)} placeholder="例如：旗舰版 CRM - 50 账号" value={productName} /></div>
            <div className="space-y-1.5"><Label htmlFor="deal-edit-channel">渠道 / 来源</Label><Input id="deal-edit-channel" list="deal-edit-channel-options" onChange={(event) => setChannel(event.target.value)} placeholder="例如：直销、代理商、转介绍" value={channel} /><datalist id="deal-edit-channel-options"><option value="直销" /><option value="代理商" /><option value="转介绍" /><option value="线上推广" /></datalist></div>
            <div className="space-y-1.5"><Label htmlFor="deal-edit-amount">预计金额（元）</Label><Input id="deal-edit-amount" min="0" onChange={(event) => setAmount(toNumber(event.target.value))} type="number" value={amount} /></div>
            <div className="space-y-1.5"><Label htmlFor="deal-edit-original-price">原价 / 刊例价（元）</Label><Input id="deal-edit-original-price" min="0" onChange={(event) => setOriginalPrice(toNumber(event.target.value))} type="number" value={originalPrice} /></div>
            <div className="space-y-1.5"><Label htmlFor="deal-edit-stage">当前阶段</Label><select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" id="deal-edit-stage" onChange={(event) => setStage(event.target.value as DealStage)} value={stage}>{dealStages.filter((item) => item !== 'Won' || deal?.stage === 'Won').map((item) => <option key={item} value={item}>{dealStageLabels[item]}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="deal-edit-close">预计成交日</Label><Input id="deal-edit-close" onChange={(event) => setExpectedCloseDate(event.target.value)} type="date" value={expectedCloseDate} /></div>
          </div>
          {stage === 'Won' && <section className="space-y-4 border-t border-border pt-5"><div><h3 className="font-semibold">赢单财务信息</h3><p className="mt-1 text-xs text-muted-foreground">当前 SaaS 到期日由客户档案统一维护，商机仅保留成交财务流水。</p></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="deal-edit-software">软件成本（分）</Label><Input id="deal-edit-software" min="0" onChange={(event) => setSoftwareCost(toNumber(event.target.value))} type="number" value={softwareCost} /></div><div className="space-y-1.5"><Label htmlFor="deal-edit-tax">开票成本（分）</Label><Input id="deal-edit-tax" min="0" onChange={(event) => setTaxCost(toNumber(event.target.value))} type="number" value={taxCost} /></div><div className="space-y-1.5"><Label htmlFor="deal-edit-rebate">返利（分）</Label><Input id="deal-edit-rebate" min="0" onChange={(event) => setRebateAmount(toNumber(event.target.value))} type="number" value={rebateAmount} /></div><div className="space-y-1.5"><Label htmlFor="deal-edit-profit">实际利润（分）</Label><Input id="deal-edit-profit" min="0" onChange={(event) => setNetProfit(toNumber(event.target.value))} type="number" value={netProfit} /></div></div><div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">自动核算利润：<strong>{calculatedNetProfit.toLocaleString('zh-CN')} 分</strong></div></section>}
        </div>
        <DialogFooter><Button onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={!productName.trim() || !expectedCloseDate || updateDeal.isPending} onClick={() => updateDeal.mutate()} type="button">{updateDeal.isPending ? '正在保存' : '保存修改'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
