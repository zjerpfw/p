// apps/web/src/components/customers/CreateContractSheet.tsx
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
import { useCreateContract } from '@/hooks/useAssets'
import { useIsMobile } from '@/hooks/useIsMobile'
import { yuanToCents } from '@/lib/money'
import type { ContractDto } from '@/lib/assets'

const contractStatusOptions = [
  { value: 'Draft', label: '草稿' },
  { value: 'Active', label: '生效中' },
] as const

const dateFieldSchema = z.string().refine(
  (value) => value === '' || !Number.isNaN(new Date(value).getTime()),
  '日期格式无效',
)

const createContractFormSchema = z.object({
  deal_id: z.string().uuid('请选择关联商机'),
  contract_number: z.string().trim().min(1, '请填写合同编号').max(100, '合同编号不能超过 100 个字符'),
  title: z.string().trim().min(1, '请填写合同名称').max(200, '合同名称不能超过 200 个字符'),
  status: z.enum(['Draft', 'Active']),
  total_amount_yuan: z.string().trim().min(1, '请填写合同金额').refine(
    (value) => {
      const cents = yuanToCents(value)
      return cents !== null && cents >= 0
    },
    '请输入最多两位小数的非负金额',
  ),
  signed_at: dateFieldSchema,
  effective_start_date: dateFieldSchema,
  effective_end_date: dateFieldSchema,
}).refine(
  (values) => !values.effective_start_date || !values.effective_end_date || values.effective_start_date <= values.effective_end_date,
  { message: '合同生效结束日不能早于开始日', path: ['effective_end_date'] },
)

type CreateContractFormValues = z.infer<typeof createContractFormSchema>

export interface ContractDealOption {
  id: string
  productName: string
  amountCents: number
}

interface CreateContractSheetProps {
  customerId: string
  customerName: string
  deals: ContractDealOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const defaultValues: CreateContractFormValues = {
  deal_id: '',
  contract_number: '',
  title: '',
  status: 'Draft',
  total_amount_yuan: '',
  signed_at: '',
  effective_start_date: '',
  effective_end_date: '',
}

export function CreateContractSheet({ customerId, customerName, deals, open, onOpenChange }: CreateContractSheetProps) {
  const isMobile = useIsMobile()
  const createContract = useCreateContract()
  const [createdContract, setCreatedContract] = useState<ContractDto | null>(null)
  const form = useForm<CreateContractFormValues>({
    resolver: zodResolver(createContractFormSchema),
    defaultValues,
  })

  useEffect(() => {
    if (open) return
    form.reset(defaultValues)
    setCreatedContract(null)
  }, [form, open])

  async function submit(values: CreateContractFormValues) {
    const totalAmountCents = yuanToCents(values.total_amount_yuan)
    if (totalAmountCents === null) {
      form.setError('total_amount_yuan', { message: '合同金额格式无效' })
      return
    }

    try {
      const contract = await createContract.mutateAsync({
        customer_id: customerId,
        deal_id: values.deal_id,
        contract_number: values.contract_number.trim(),
        title: values.title.trim(),
        status: values.status,
        // UI boundary: yuan string -> integer cents. The API never receives yuan values.
        total_amount_cents: totalAmountCents,
        signed_at: values.signed_at || null,
        effective_start_date: values.effective_start_date || null,
        effective_end_date: values.effective_end_date || null,
      })
      setCreatedContract(contract)
      toast.success('合同已创建，可继续上传合同文件')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '新建合同失败')
    }
  }

  function closeSheet() {
    if (createContract.isPending) return
    onOpenChange(false)
  }

  const formContent = (
    <form className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" onSubmit={form.handleSubmit(submit)}>
      <div className="space-y-4 rounded-lg bg-slate-50 p-4">
        <div className="space-y-1.5"><Label>客户名称</Label><p className="h-11 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 md:h-9 md:py-2">{customerName}</p></div>
        <div className="space-y-1.5">
          <Label htmlFor="contract-deal"><span className="text-rose-500">*</span> 关联商机</Label>
          <Select onValueChange={(value) => form.setValue('deal_id', value, { shouldValidate: true })} value={form.watch('deal_id')}>
            <SelectTrigger aria-invalid={Boolean(form.formState.errors.deal_id)} id="contract-deal"><SelectValue placeholder="选择该合同对应的商机" /></SelectTrigger>
            <SelectContent>{deals.map((deal) => <SelectItem key={deal.id} value={deal.id}>{deal.productName || '未命名产品'}</SelectItem>)}</SelectContent>
          </Select>
          {form.formState.errors.deal_id && <p className="text-sm text-destructive">{form.formState.errors.deal_id.message}</p>}
        </div>
        {deals.length === 0 && <p className="text-sm text-amber-700">该客户暂无商机，暂时不能创建合同。</p>}
        <div className="space-y-1.5"><Label htmlFor="contract-number"><span className="text-rose-500">*</span> 合同编号</Label><Input id="contract-number" placeholder="例如：HT-2026-001" {...form.register('contract_number')} />{form.formState.errors.contract_number && <p className="text-sm text-destructive">{form.formState.errors.contract_number.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="contract-title"><span className="text-rose-500">*</span> 合同名称</Label><Input id="contract-title" placeholder="请输入合同名称" {...form.register('title')} />{form.formState.errors.title && <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="contract-amount"><span className="text-rose-500">*</span> 合同总额（元）</Label><Input id="contract-amount" inputMode="decimal" placeholder="例如：12800.50" step="0.01" type="number" {...form.register('total_amount_yuan')} />{form.formState.errors.total_amount_yuan && <p className="text-sm text-destructive">{form.formState.errors.total_amount_yuan.message}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="contract-status">合同状态</Label><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm md:h-9" id="contract-status" {...form.register('status')}>{contractStatusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="contract-signed-at">签署日期</Label><Input id="contract-signed-at" type="date" {...form.register('signed_at')} /></div><div className="space-y-1.5"><Label htmlFor="contract-start-date">生效开始日</Label><Input id="contract-start-date" type="date" {...form.register('effective_start_date')} /></div></div>
        <div className="space-y-1.5"><Label htmlFor="contract-end-date">生效结束日</Label><Input id="contract-end-date" type="date" {...form.register('effective_end_date')} />{form.formState.errors.effective_end_date && <p className="text-sm text-destructive">{form.formState.errors.effective_end_date.message}</p>}</div>
      </div>
    </form>
  )

  const uploadContent = createdContract && (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
      <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="flex items-center gap-2 font-semibold text-emerald-800"><FileCheck2 className="size-5" />合同已保存</p>
        <p className="mt-2 text-sm text-emerald-700">{createdContract.contract_number} · {createdContract.title}</p>
      </section>
      <section className="space-y-3 rounded-lg bg-slate-50 p-4">
        <div><p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FileUp className="size-4" />上传合同文件</p><p className="mt-1 text-xs text-muted-foreground">文件会直传至私有存储桶，并由服务端核验后登记为资产附件。</p></div>
        <SecureAssetUploader
          assetType="Contract"
          contractId={createdContract.id}
          customerId={createdContract.customer_id}
          dealId={createdContract.deal_id}
          onSuccess={() => {
            toast.success('合同与附件已完成登记')
            onOpenChange(false)
          }}
        />
      </section>
    </div>
  )

  const content = (
    <>
      <SheetHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
        <SheetTitle>{createdContract ? '上传合同文件' : '新建合同'}</SheetTitle>
        <SheetDescription>{createdContract ? '合同已创建，可选上传扫描件或电子合同。' : '保存后可继续上传合同扫描件或电子合同。'}</SheetDescription>
      </SheetHeader>
      {createdContract ? uploadContent : formContent}
      <SheetFooter className="border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4">
        <Button onClick={closeSheet} type="button" variant="outline">{createdContract ? '跳过附件并关闭' : '取消'}</Button>
        {!createdContract && <Button disabled={createContract.isPending || deals.length === 0} onClick={form.handleSubmit(submit)} type="button">{createContract.isPending ? '正在保存' : '保存合同'}</Button>}
      </SheetFooter>
    </>
  )

  if (isMobile) return <Sheet onOpenChange={onOpenChange} open={open}><SheetContent className="h-[92dvh] max-h-[92dvh] w-full gap-0 overflow-hidden rounded-t-2xl border-t p-0" side="bottom">{content}</SheetContent></Sheet>
  return <Sheet onOpenChange={onOpenChange} open={open}><SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-lg">{content}</SheetContent></Sheet>
}
