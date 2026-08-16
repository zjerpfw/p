// apps/web/src/components/customers/CreateInvoiceSheet.tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { FileCheck2, FileUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { SecureAssetUploader } from '@/components/SecureAssetUploader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useCreateInvoice } from '@/hooks/useAssets'
import { useIsMobile } from '@/hooks/useIsMobile'
import { yuanToCents } from '@/lib/money'
import type { ContractDto, InvoiceDto } from '@/lib/assets'

const dateFieldSchema = z.string().refine(
  (value) => value === '' || !Number.isNaN(new Date(value).getTime()),
  '日期格式无效',
)

const optionalYuanSchema = z.string().trim().refine(
  (value) => value === '' || (yuanToCents(value) !== null && (yuanToCents(value) ?? 0) >= 0),
  '请输入最多两位小数的非负金额',
)

const createInvoiceFormSchema = z.object({
  contract_id: z.string().uuid('请选择归属合同'),
  invoice_number: z.string().trim().max(100, '发票号码不能超过 100 个字符'),
  title: z.string().trim().min(1, '请填写发票抬头').max(200, '发票抬头不能超过 200 个字符'),
  content: z.string().trim().min(1, '请填写开票内容').max(500, '开票内容不能超过 500 个字符'),
  amount_yuan: z.string().trim().min(1, '请填写开票金额').refine(
    (value) => {
      const cents = yuanToCents(value)
      return cents !== null && cents >= 0
    },
    '请输入最多两位小数的非负金额',
  ),
  tax_amount_yuan: optionalYuanSchema,
  issued_at: dateFieldSchema,
})

type CreateInvoiceFormValues = z.infer<typeof createInvoiceFormSchema>

interface CreateInvoiceSheetProps {
  customerId: string
  customerName: string
  contracts: ContractDto[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const defaultValues: CreateInvoiceFormValues = {
  contract_id: '',
  invoice_number: '',
  title: '',
  content: '',
  amount_yuan: '',
  tax_amount_yuan: '',
  issued_at: '',
}

export function CreateInvoiceSheet({ customerId, customerName, contracts, open, onOpenChange }: CreateInvoiceSheetProps) {
  const isMobile = useIsMobile()
  const createInvoice = useCreateInvoice()
  const [createdInvoice, setCreatedInvoice] = useState<InvoiceDto | null>(null)
  const form = useForm<CreateInvoiceFormValues>({ resolver: zodResolver(createInvoiceFormSchema), defaultValues })

  useEffect(() => {
    if (open) return
    form.reset(defaultValues)
    setCreatedInvoice(null)
  }, [form, open])

  async function submit(values: CreateInvoiceFormValues) {
    const amountCents = yuanToCents(values.amount_yuan)
    const taxAmountCents = values.tax_amount_yuan ? yuanToCents(values.tax_amount_yuan) : 0
    if (amountCents === null || taxAmountCents === null) {
      form.setError('amount_yuan', { message: '开票金额格式无效' })
      return
    }
    try {
      const invoice = await createInvoice.mutateAsync({
        contract_id: values.contract_id,
        invoice_number: values.invoice_number.trim() || null,
        title: values.title.trim(),
        content: values.content.trim(),
        status: 'Draft',
        // UI boundary: yuan strings -> integer cents. The API never receives yuan values.
        amount_cents: amountCents,
        tax_amount_cents: taxAmountCents,
        issued_at: values.issued_at || null,
      })
      setCreatedInvoice(invoice)
      toast.success('开票申请已保存，可继续上传发票文件')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建开票申请失败')
    }
  }

  function closeSheet() {
    if (!createInvoice.isPending) onOpenChange(false)
  }

  const formContent = (
    <form className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" onSubmit={form.handleSubmit(submit)}>
      <div className="space-y-4 rounded-lg bg-slate-50 p-4">
        <div className="space-y-1.5"><Label>客户名称</Label><p className="h-11 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 md:h-9 md:py-2">{customerName}</p></div>
        <div className="space-y-1.5"><Label htmlFor="invoice-contract"><span className="text-rose-500">*</span> 归属合同</Label><Select onValueChange={(value) => form.setValue('contract_id', value, { shouldValidate: true })} value={form.watch('contract_id')}><SelectTrigger aria-invalid={Boolean(form.formState.errors.contract_id)} id="invoice-contract"><SelectValue placeholder="选择开票归属的合同" /></SelectTrigger><SelectContent>{contracts.map((contract) => <SelectItem key={contract.id} value={contract.id}>{contract.contract_number} · {contract.title}</SelectItem>)}</SelectContent></Select>{form.formState.errors.contract_id && <p className="text-sm text-destructive">{form.formState.errors.contract_id.message}</p>}</div>
        {contracts.length === 0 && <p className="text-sm text-amber-700">该客户暂无合同，暂时不能申请开票。</p>}
        <div className="space-y-1.5"><Label htmlFor="invoice-number">发票号码（选填）</Label><Input id="invoice-number" placeholder="可在正式开票后补充" {...form.register('invoice_number')} />{form.formState.errors.invoice_number && <p className="text-sm text-destructive">{form.formState.errors.invoice_number.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="invoice-title"><span className="text-rose-500">*</span> 发票抬头</Label><Input id="invoice-title" placeholder="请输入发票抬头" {...form.register('title')} />{form.formState.errors.title && <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="invoice-content"><span className="text-rose-500">*</span> 开票内容</Label><textarea className="min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus:ring-[3px] focus:ring-ring/30" id="invoice-content" placeholder="例如：软件服务费" {...form.register('content')} />{form.formState.errors.content && <p className="text-sm text-destructive">{form.formState.errors.content.message}</p>}</div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="invoice-amount"><span className="text-rose-500">*</span> 开票金额（元）</Label><Input id="invoice-amount" inputMode="decimal" placeholder="例如：12800.50" step="0.01" type="number" {...form.register('amount_yuan')} />{form.formState.errors.amount_yuan && <p className="text-sm text-destructive">{form.formState.errors.amount_yuan.message}</p>}</div><div className="space-y-1.5"><Label htmlFor="invoice-tax">税额（元）</Label><Input id="invoice-tax" inputMode="decimal" placeholder="选填，默认 0" step="0.01" type="number" {...form.register('tax_amount_yuan')} />{form.formState.errors.tax_amount_yuan && <p className="text-sm text-destructive">{form.formState.errors.tax_amount_yuan.message}</p>}</div></div>
        <div className="space-y-1.5"><Label htmlFor="invoice-issued-at">开票日期</Label><Input id="invoice-issued-at" type="date" {...form.register('issued_at')} />{form.formState.errors.issued_at && <p className="text-sm text-destructive">{form.formState.errors.issued_at.message}</p>}</div>
      </div>
    </form>
  )

  const uploadContent = createdInvoice && (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
      <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="flex items-center gap-2 font-semibold text-emerald-800"><FileCheck2 className="size-5" />开票申请已保存</p><p className="mt-2 text-sm text-emerald-700">{createdInvoice.invoice_number ?? createdInvoice.title}</p></section>
      <section className="space-y-3 rounded-lg bg-slate-50 p-4"><div><p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FileUp className="size-4" />上传发票文件</p><p className="mt-1 text-xs text-muted-foreground">上传发票 PDF 或扫描件后，系统会在私有存储中完成核验和登记。</p></div><SecureAssetUploader assetType="Invoice" customerId={createdInvoice.customer_id} dealId={createdInvoice.deal_id} invoiceId={createdInvoice.id} onSuccess={() => { toast.success('开票申请与附件已完成登记'); onOpenChange(false) }} /></section>
    </div>
  )

  const content = <>
    <SheetHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5"><SheetTitle>{createdInvoice ? '上传发票文件' : '申请开票'}</SheetTitle><SheetDescription>{createdInvoice ? '开票申请已保存，可选上传发票 PDF 或扫描件。' : '保存后可继续上传发票 PDF 或扫描件。'}</SheetDescription></SheetHeader>
    {createdInvoice ? uploadContent : formContent}
    <SheetFooter className="border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4"><Button onClick={closeSheet} type="button" variant="outline">{createdInvoice ? '跳过附件并关闭' : '取消'}</Button>{!createdInvoice && <Button disabled={createInvoice.isPending || contracts.length === 0} onClick={form.handleSubmit(submit)} type="button">{createInvoice.isPending ? '正在保存' : '保存开票申请'}</Button>}</SheetFooter>
  </>

  if (isMobile) return <Sheet onOpenChange={onOpenChange} open={open}><SheetContent className="h-[92dvh] max-h-[92dvh] w-full gap-0 overflow-hidden rounded-t-2xl border-t p-0" side="bottom">{content}</SheetContent></Sheet>
  return <Sheet onOpenChange={onOpenChange} open={open}><SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-lg">{content}</SheetContent></Sheet>
}
