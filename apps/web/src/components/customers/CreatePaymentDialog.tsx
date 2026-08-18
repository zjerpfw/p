// apps/web/src/components/customers/CreatePaymentDialog.tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { BadgeCheck, FileUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { SecureAssetUploader } from '@/components/SecureAssetUploader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCreatePayment } from '@/hooks/useAssets'
import { yuanToCents } from '@/lib/money'
import type { ContractDto, InvoiceDto, PaymentDto } from '@/lib/assets'

const NO_INVOICE_VALUE = '__none__'

const dateFieldSchema = z.string().refine(
  (value) => value === '' || !Number.isNaN(new Date(value).getTime()),
  '日期格式无效',
)

const createPaymentFormSchema = z.object({
  contract_id: z.string().uuid('请选择归属合同'),
  invoice_id: z.string().uuid('请选择有效发票').optional(),
  payment_number: z.string().trim().min(1, '请填写回款编号').max(100, '回款编号不能超过 100 个字符'),
  amount_yuan: z.string().trim().min(1, '请填写回款金额').refine(
    (value) => {
      const cents = yuanToCents(value)
      return cents !== null && cents > 0
    },
    '请输入最多两位小数的正数金额',
  ),
  paid_at: dateFieldSchema,
  note: z.string().trim().max(1_000, '备注不能超过 1000 个字符'),
})

type CreatePaymentFormValues = z.infer<typeof createPaymentFormSchema>

interface CreatePaymentDialogProps {
  customerId: string
  customerName: string
  contracts: ContractDto[]
  invoices: InvoiceDto[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const defaultValues: CreatePaymentFormValues = {
  contract_id: '',
  invoice_id: undefined,
  payment_number: '',
  amount_yuan: '',
  paid_at: '',
  note: '',
}

export function CreatePaymentDialog({ customerId, customerName, contracts, invoices, open, onOpenChange }: CreatePaymentDialogProps) {
  const createPayment = useCreatePayment()
  const [createdPayment, setCreatedPayment] = useState<PaymentDto | null>(null)
  const form = useForm<CreatePaymentFormValues>({
    resolver: zodResolver(createPaymentFormSchema),
    defaultValues,
  })
  const selectedContractId = form.watch('contract_id')
  const availableInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.contract_id === selectedContractId),
    [invoices, selectedContractId],
  )

  useEffect(() => {
    if (open) return
    form.reset(defaultValues)
    setCreatedPayment(null)
  }, [form, open])

  useEffect(() => {
    const currentInvoiceId = form.getValues('invoice_id')
    if (currentInvoiceId && !availableInvoices.some((invoice) => invoice.id === currentInvoiceId)) {
      form.setValue('invoice_id', undefined)
    }
  }, [availableInvoices, form])

  async function submit(values: CreatePaymentFormValues) {
    const amountCents = yuanToCents(values.amount_yuan)
    if (amountCents === null || amountCents <= 0) {
      form.setError('amount_yuan', { message: '回款金额格式无效' })
      return
    }

    try {
      const payment = await createPayment.mutateAsync({
        contract_id: values.contract_id,
        invoice_id: values.invoice_id ?? null,
        payment_number: values.payment_number.trim(),
        // UI boundary: yuan string -> integer cents. The API never receives yuan values.
        amount_cents: amountCents,
        status: 'Received',
        paid_at: values.paid_at || null,
        note: values.note.trim() || null,
      })
      setCreatedPayment(payment)
      toast.success('回款已登记，可继续上传打款凭证')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登记回款失败')
    }
  }

  function closeDialog() {
    if (!createPayment.isPending) onOpenChange(false)
  }

  const formContent = (
    <form className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" onSubmit={form.handleSubmit(submit)}>
      <div className="space-y-4 rounded-lg bg-slate-50 p-4">
        <div className="space-y-1.5"><Label>客户名称</Label><p className="h-11 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 md:h-9 md:py-2">{customerName}</p></div>
        <div className="space-y-1.5">
          <Label htmlFor="payment-contract"><span className="text-rose-500">*</span> 归属合同</Label>
          <Select onValueChange={(value) => form.setValue('contract_id', value, { shouldValidate: true })} value={selectedContractId}>
            <SelectTrigger aria-invalid={Boolean(form.formState.errors.contract_id)} id="payment-contract"><SelectValue placeholder="选择回款归属的合同" /></SelectTrigger>
            <SelectContent>{contracts.map((contract) => <SelectItem key={contract.id} value={contract.id}>{contract.contract_number} · {contract.title}</SelectItem>)}</SelectContent>
          </Select>
          {form.formState.errors.contract_id && <p className="text-sm text-destructive">{form.formState.errors.contract_id.message}</p>}
        </div>
        {contracts.length === 0 && <p className="text-sm text-amber-700">该客户暂无合同，暂时不能登记回款。</p>}
        <div className="space-y-1.5">
          <Label htmlFor="payment-invoice">关联发票（选填）</Label>
          <Select onValueChange={(value) => form.setValue('invoice_id', value === NO_INVOICE_VALUE ? undefined : value, { shouldValidate: true })} value={form.watch('invoice_id') ?? NO_INVOICE_VALUE}>
            <SelectTrigger disabled={!selectedContractId} id="payment-invoice"><SelectValue placeholder="可先回款后开票" /></SelectTrigger>
            <SelectContent><SelectItem value={NO_INVOICE_VALUE}>暂不关联发票</SelectItem>{availableInvoices.map((invoice) => <SelectItem key={invoice.id} value={invoice.id}>{invoice.invoice_number ?? invoice.title}</SelectItem>)}</SelectContent>
          </Select>
          {form.formState.errors.invoice_id && <p className="text-sm text-destructive">{form.formState.errors.invoice_id.message}</p>}
        </div>
        <div className="space-y-1.5"><Label htmlFor="payment-number"><span className="text-rose-500">*</span> 回款编号</Label><Input id="payment-number" placeholder="例如：SK-2026-001" {...form.register('payment_number')} />{form.formState.errors.payment_number && <p className="text-sm text-destructive">{form.formState.errors.payment_number.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="payment-amount"><span className="text-rose-500">*</span> 回款金额（元）</Label><Input id="payment-amount" inputMode="decimal" placeholder="例如：12800.50" step="0.01" type="number" {...form.register('amount_yuan')} />{form.formState.errors.amount_yuan && <p className="text-sm text-destructive">{form.formState.errors.amount_yuan.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="payment-paid-at">打款日期</Label><Input id="payment-paid-at" type="date" {...form.register('paid_at')} />{form.formState.errors.paid_at && <p className="text-sm text-destructive">{form.formState.errors.paid_at.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="payment-note">备注</Label><textarea className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus:ring-[3px] focus:ring-ring/30" id="payment-note" placeholder="可填写付款方、到账说明等" {...form.register('note')} />{form.formState.errors.note && <p className="text-sm text-destructive">{form.formState.errors.note.message}</p>}</div>
      </div>
    </form>
  )

  const uploadContent = createdPayment && (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
      <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="flex items-center gap-2 font-semibold text-emerald-800"><BadgeCheck className="size-5" />回款已登记</p><p className="mt-2 text-sm text-emerald-700">{createdPayment.payment_number}</p></section>
      <section className="space-y-3 rounded-lg bg-slate-50 p-4"><div><p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FileUp className="size-4" />上传打款凭证</p><p className="mt-1 text-xs text-muted-foreground">上传截图或凭证 PDF 后，系统会在私有存储中完成核验和登记。</p></div><SecureAssetUploader assetType="PaymentProof" customerId={createdPayment.customer_id} dealId={createdPayment.deal_id} paymentId={createdPayment.id} onSuccess={() => { toast.success('回款与打款凭证已完成登记'); onOpenChange(false) }} /></section>
    </div>
  )

  const content = <>
    <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5"><DialogTitle>{createdPayment ? '上传打款凭证' : '登记回款'}</DialogTitle><DialogDescription>{createdPayment ? '回款已保存，可选上传打款凭证。' : '保存后可继续上传银行回单或打款截图。'}</DialogDescription></DialogHeader>
    {createdPayment ? uploadContent : formContent}
    <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4"><Button onClick={closeDialog} type="button" variant="outline">{createdPayment ? '跳过凭证并关闭' : '取消'}</Button>{!createdPayment && <Button disabled={createPayment.isPending || contracts.length === 0} onClick={form.handleSubmit(submit)} type="button">{createPayment.isPending ? '正在保存' : '保存回款'}</Button>}</DialogFooter>
  </>

  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-y-auto p-0 sm:max-w-[600px]">{content}</DialogContent></Dialog>
}
