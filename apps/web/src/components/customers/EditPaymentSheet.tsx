// apps/web/src/components/customers/EditPaymentSheet.tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useUpdatePayment } from '@/hooks/useAssets'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { InvoiceDto, PaymentDto, PaymentStatus } from '@/lib/assets'
import { centsToYuanInput, yuanToCents } from '@/lib/money'

const NO_INVOICE_VALUE = '__none__'
const paymentStatusOptions: Array<{ value: PaymentStatus; label: string }> = [
  { value: 'Pending', label: '待确认' },
  { value: 'Received', label: '已到账' },
  { value: 'Reversed', label: '已冲回' },
]
const dateFieldSchema = z.string().refine((value) => value === '' || !Number.isNaN(new Date(value).getTime()), '日期格式无效')
const editPaymentFormSchema = z.object({
  invoice_id: z.string().uuid('请选择有效发票').optional(),
  payment_number: z.string().trim().min(1, '请填写回款编号').max(100, '回款编号不能超过 100 个字符'),
  amount_yuan: z.string().trim().min(1, '请填写回款金额').refine((value) => (yuanToCents(value) ?? 0) > 0, '请输入最多两位小数的正数金额'),
  status: z.enum(['Pending', 'Received', 'Reversed']),
  paid_at: dateFieldSchema,
  note: z.string().trim().max(1_000, '备注不能超过 1000 个字符'),
})
type EditPaymentFormValues = z.infer<typeof editPaymentFormSchema>

interface EditPaymentSheetProps {
  payment: PaymentDto | null
  invoices: InvoiceDto[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function defaultValues(payment: PaymentDto | null): EditPaymentFormValues {
  return { invoice_id: payment?.invoice_id ?? undefined, payment_number: payment?.payment_number ?? '', amount_yuan: centsToYuanInput(payment?.amount_cents), status: payment?.status ?? 'Pending', paid_at: payment?.paid_at?.slice(0, 10) ?? '', note: payment?.note ?? '' }
}

export function EditPaymentSheet({ payment, invoices, open, onOpenChange }: EditPaymentSheetProps) {
  const isMobile = useIsMobile()
  const updatePayment = useUpdatePayment()
  const form = useForm<EditPaymentFormValues>({ resolver: zodResolver(editPaymentFormSchema), defaultValues: defaultValues(payment) })
  const availableInvoices = useMemo(() => invoices.filter((invoice) => invoice.contract_id === payment?.contract_id), [invoices, payment?.contract_id])

  useEffect(() => { if (open && payment) form.reset(defaultValues(payment)) }, [form, open, payment])

  async function submit(values: EditPaymentFormValues) {
    if (!payment) return
    const amountCents = yuanToCents(values.amount_yuan)
    if (amountCents === null || amountCents <= 0) return
    try {
      await updatePayment.mutateAsync({ id: payment.id, payload: { invoice_id: values.invoice_id ?? null, payment_number: values.payment_number.trim(), amount_cents: amountCents, status: values.status, paid_at: values.paid_at || null, note: values.note.trim() || null } })
      toast.success('回款记录已更新')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新回款失败')
    }
  }

  const content = <>
    <SheetHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5"><SheetTitle>编辑回款</SheetTitle><SheetDescription>可更正金额、到账状态、日期、备注与关联发票。</SheetDescription></SheetHeader>
    <form className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" onSubmit={form.handleSubmit(submit)}>
      <div className="space-y-4 rounded-lg bg-slate-50 p-4">
        <div className="space-y-1.5"><Label>归属合同</Label><p className="h-11 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 md:h-9 md:py-2">{payment?.contract_number ?? '未选择'}</p></div>
        <div className="space-y-1.5"><Label htmlFor="edit-payment-invoice">关联发票</Label><Select onValueChange={(value) => form.setValue('invoice_id', value === NO_INVOICE_VALUE ? undefined : value, { shouldValidate: true })} value={form.watch('invoice_id') ?? NO_INVOICE_VALUE}><SelectTrigger id="edit-payment-invoice"><SelectValue placeholder="可先回款后开票" /></SelectTrigger><SelectContent><SelectItem value={NO_INVOICE_VALUE}>暂不关联发票</SelectItem>{availableInvoices.map((invoice) => <SelectItem key={invoice.id} value={invoice.id}>{invoice.invoice_number ?? invoice.title}</SelectItem>)}</SelectContent></Select>{form.formState.errors.invoice_id && <p className="text-sm text-destructive">{form.formState.errors.invoice_id.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="edit-payment-number"><span className="text-rose-500">*</span> 回款编号</Label><Input id="edit-payment-number" {...form.register('payment_number')} />{form.formState.errors.payment_number && <p className="text-sm text-destructive">{form.formState.errors.payment_number.message}</p>}</div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="edit-payment-amount"><span className="text-rose-500">*</span> 回款金额（元）</Label><Input id="edit-payment-amount" inputMode="decimal" step="0.01" type="number" {...form.register('amount_yuan')} />{form.formState.errors.amount_yuan && <p className="text-sm text-destructive">{form.formState.errors.amount_yuan.message}</p>}</div><div className="space-y-1.5"><Label htmlFor="edit-payment-status">到账状态</Label><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm md:h-9" id="edit-payment-status" {...form.register('status')}>{paymentStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div></div>
        <div className="space-y-1.5"><Label htmlFor="edit-payment-paid-at">打款日期</Label><Input id="edit-payment-paid-at" type="date" {...form.register('paid_at')} />{form.formState.errors.paid_at && <p className="text-sm text-destructive">{form.formState.errors.paid_at.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="edit-payment-note">备注</Label><textarea className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus:ring-[3px] focus:ring-ring/30" id="edit-payment-note" {...form.register('note')} />{form.formState.errors.note && <p className="text-sm text-destructive">{form.formState.errors.note.message}</p>}</div>
      </div>
    </form>
    <SheetFooter className="border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4"><Button disabled={updatePayment.isPending} onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={updatePayment.isPending || !payment} onClick={form.handleSubmit(submit)} type="button">{updatePayment.isPending ? '正在保存' : '保存变更'}</Button></SheetFooter>
  </>

  if (isMobile) return <Sheet onOpenChange={onOpenChange} open={open}><SheetContent className="h-[92dvh] max-h-[92dvh] w-full gap-0 overflow-hidden rounded-t-2xl border-t p-0" side="bottom">{content}</SheetContent></Sheet>
  return <Sheet onOpenChange={onOpenChange} open={open}><SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-lg">{content}</SheetContent></Sheet>
}
