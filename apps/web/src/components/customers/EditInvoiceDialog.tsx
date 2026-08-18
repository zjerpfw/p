// apps/web/src/components/customers/EditInvoiceDialog.tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUpdateInvoice } from '@/hooks/useAssets'
import type { InvoiceDto, InvoiceStatus } from '@/lib/assets'
import { centsToYuanInput, yuanToCents } from '@/lib/money'

const invoiceStatusOptions: Array<{ value: InvoiceStatus; label: string }> = [
  { value: 'Draft', label: '草稿' },
  { value: 'Issued', label: '已开票' },
  { value: 'Voided', label: '已作废' },
]

const dateFieldSchema = z.string().refine(
  (value) => value === '' || !Number.isNaN(new Date(value).getTime()),
  '日期格式无效',
)

const editInvoiceFormSchema = z.object({
  invoice_number: z.string().trim().max(100, '发票号码不能超过 100 个字符'),
  title: z.string().trim().min(1, '请填写发票抬头').max(200, '发票抬头不能超过 200 个字符'),
  content: z.string().trim().min(1, '请填写开票内容').max(500, '开票内容不能超过 500 个字符'),
  status: z.enum(['Draft', 'Issued', 'Voided']),
  amount_yuan: z.string().trim().min(1, '请填写开票金额').refine((value) => (yuanToCents(value) ?? -1) >= 0, '请输入最多两位小数的非负金额'),
  tax_amount_yuan: z.string().trim().min(1, '请填写税额').refine((value) => (yuanToCents(value) ?? -1) >= 0, '请输入最多两位小数的非负金额'),
  issued_at: dateFieldSchema,
})

type EditInvoiceFormValues = z.infer<typeof editInvoiceFormSchema>

interface EditInvoiceDialogProps {
  invoice: InvoiceDto | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function defaultValues(invoice: InvoiceDto | null): EditInvoiceFormValues {
  return {
    invoice_number: invoice?.invoice_number ?? '',
    title: invoice?.title ?? '',
    content: invoice?.content ?? '',
    status: invoice?.status ?? 'Draft',
    amount_yuan: centsToYuanInput(invoice?.amount_cents),
    tax_amount_yuan: centsToYuanInput(invoice?.tax_amount_cents),
    issued_at: invoice?.issued_at?.slice(0, 10) ?? '',
  }
}

export function EditInvoiceDialog({ invoice, open, onOpenChange }: EditInvoiceDialogProps) {
  const updateInvoice = useUpdateInvoice()
  const form = useForm<EditInvoiceFormValues>({ resolver: zodResolver(editInvoiceFormSchema), defaultValues: defaultValues(invoice) })

  useEffect(() => {
    if (open && invoice) form.reset(defaultValues(invoice))
  }, [form, invoice, open])

  async function submit(values: EditInvoiceFormValues) {
    if (!invoice) return
    const amountCents = yuanToCents(values.amount_yuan)
    const taxAmountCents = yuanToCents(values.tax_amount_yuan)
    if (amountCents === null || taxAmountCents === null) return
    try {
      await updateInvoice.mutateAsync({ id: invoice.id, payload: {
        invoice_number: values.invoice_number.trim() || null,
        title: values.title.trim(),
        content: values.content.trim(),
        status: values.status,
        amount_cents: amountCents,
        tax_amount_cents: taxAmountCents,
        issued_at: values.issued_at || null,
      } })
      toast.success('发票资料已更新')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新发票失败')
    }
  }

  const content = <>
    <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5"><DialogTitle>编辑发票</DialogTitle><DialogDescription>可更正发票状态、金额及正式开票信息。</DialogDescription></DialogHeader>
    <form className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" onSubmit={form.handleSubmit(submit)}>
      <div className="space-y-4 rounded-lg bg-slate-50 p-4">
        <div className="space-y-1.5"><Label htmlFor="edit-invoice-number">发票号码</Label><Input id="edit-invoice-number" {...form.register('invoice_number')} />{form.formState.errors.invoice_number && <p className="text-sm text-destructive">{form.formState.errors.invoice_number.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="edit-invoice-title"><span className="text-rose-500">*</span> 发票抬头</Label><Input id="edit-invoice-title" {...form.register('title')} />{form.formState.errors.title && <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="edit-invoice-content"><span className="text-rose-500">*</span> 开票内容</Label><textarea className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus:ring-[3px] focus:ring-ring/30" id="edit-invoice-content" {...form.register('content')} />{form.formState.errors.content && <p className="text-sm text-destructive">{form.formState.errors.content.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="edit-invoice-status">发票状态</Label><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm md:h-9" id="edit-invoice-status" {...form.register('status')}>{invoiceStatusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="edit-invoice-amount"><span className="text-rose-500">*</span> 开票金额（元）</Label><Input id="edit-invoice-amount" inputMode="decimal" step="0.01" type="number" {...form.register('amount_yuan')} />{form.formState.errors.amount_yuan && <p className="text-sm text-destructive">{form.formState.errors.amount_yuan.message}</p>}</div><div className="space-y-1.5"><Label htmlFor="edit-invoice-tax"><span className="text-rose-500">*</span> 税额（元）</Label><Input id="edit-invoice-tax" inputMode="decimal" step="0.01" type="number" {...form.register('tax_amount_yuan')} />{form.formState.errors.tax_amount_yuan && <p className="text-sm text-destructive">{form.formState.errors.tax_amount_yuan.message}</p>}</div></div>
        <div className="space-y-1.5"><Label htmlFor="edit-invoice-issued-at">开票日期</Label><Input id="edit-invoice-issued-at" type="date" {...form.register('issued_at')} />{form.formState.errors.issued_at && <p className="text-sm text-destructive">{form.formState.errors.issued_at.message}</p>}</div>
      </div>
    </form>
    <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4"><Button disabled={updateInvoice.isPending} onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={updateInvoice.isPending || !invoice} onClick={form.handleSubmit(submit)} type="button">{updateInvoice.isPending ? '正在保存' : '保存变更'}</Button></DialogFooter>
  </>

  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-y-auto p-0 sm:max-w-[600px]">{content}</DialogContent></Dialog>
}
