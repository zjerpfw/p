// apps/web/src/components/customers/EditContractDialog.tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useUpdateContract } from '@/hooks/useAssets'
import type { ContractDto, ContractStatus } from '@/lib/assets'
import { centsToYuanInput, yuanToCents } from '@/lib/money'

const contractStatusOptions: Array<{ value: ContractStatus; label: string }> = [
  { value: 'Draft', label: '草稿' },
  { value: 'Active', label: '生效中' },
  { value: 'Expired', label: '已到期' },
  { value: 'Terminated', label: '已终止' },
  { value: 'Void', label: '已作废' },
]

const dateFieldSchema = z.string().refine(
  (value) => value === '' || !Number.isNaN(new Date(value).getTime()),
  '日期格式无效',
)

const editContractFormSchema = z.object({
  contract_number: z.string().trim().min(1, '请填写合同编号').max(100, '合同编号不能超过 100 个字符'),
  title: z.string().trim().min(1, '请填写合同名称').max(200, '合同名称不能超过 200 个字符'),
  status: z.enum(['Draft', 'Active', 'Expired', 'Terminated', 'Void']),
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
  payment_due_at: dateFieldSchema,
}).refine(
  (values) => !values.effective_start_date || !values.effective_end_date || values.effective_start_date <= values.effective_end_date,
  { message: '合同生效结束日不能早于开始日', path: ['effective_end_date'] },
)

type EditContractFormValues = z.infer<typeof editContractFormSchema>

interface EditContractDialogProps {
  contract: ContractDto | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function toDateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : ''
}

function getDefaultValues(contract: ContractDto | null): EditContractFormValues {
  return {
    contract_number: contract?.contract_number ?? '',
    title: contract?.title ?? '',
    status: contract?.status ?? 'Draft',
    total_amount_yuan: centsToYuanInput(contract?.total_amount_cents),
    signed_at: toDateInputValue(contract?.signed_at ?? null),
    effective_start_date: toDateInputValue(contract?.effective_start_date ?? null),
    effective_end_date: toDateInputValue(contract?.effective_end_date ?? null),
    payment_due_at: toDateInputValue(contract?.payment_due_at ?? null),
  }
}

export function EditContractDialog({ contract, open, onOpenChange }: EditContractDialogProps) {
  const updateContract = useUpdateContract()
  const form = useForm<EditContractFormValues>({
    resolver: zodResolver(editContractFormSchema),
    defaultValues: getDefaultValues(contract),
  })

  useEffect(() => {
    if (open && contract) form.reset(getDefaultValues(contract))
  }, [contract, form, open])

  async function submit(values: EditContractFormValues) {
    if (!contract) return
    const totalAmountCents = yuanToCents(values.total_amount_yuan)
    if (totalAmountCents === null) {
      form.setError('total_amount_yuan', { message: '合同金额格式无效' })
      return
    }

    try {
      await updateContract.mutateAsync({
        id: contract.id,
        payload: {
          contract_number: values.contract_number.trim(),
          title: values.title.trim(),
          status: values.status,
          total_amount_cents: totalAmountCents,
          signed_at: values.signed_at || null,
          effective_start_date: values.effective_start_date || null,
          effective_end_date: values.effective_end_date || null,
          payment_due_at: values.payment_due_at || null,
        },
      })
      toast.success('合同资料已更新')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新合同失败')
    }
  }

  function closeDialog() {
    if (!updateContract.isPending) onOpenChange(false)
  }

  const content = (
    <>
      <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
        <DialogTitle>编辑合同</DialogTitle>
        <DialogDescription>补充回款截止日后，逾期应收会自动纳入仪表盘。</DialogDescription>
      </DialogHeader>
      <form className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" onSubmit={form.handleSubmit(submit)}>
        <div className="space-y-4 rounded-lg bg-slate-50 p-4">
          <div className="space-y-1.5"><Label htmlFor="edit-contract-number"><span className="text-rose-500">*</span> 合同编号</Label><Input id="edit-contract-number" {...form.register('contract_number')} />{form.formState.errors.contract_number && <p className="text-sm text-destructive">{form.formState.errors.contract_number.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="edit-contract-title"><span className="text-rose-500">*</span> 合同名称</Label><Input id="edit-contract-title" {...form.register('title')} />{form.formState.errors.title && <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="edit-contract-amount"><span className="text-rose-500">*</span> 合同总额（元）</Label><Input id="edit-contract-amount" inputMode="decimal" step="0.01" type="number" {...form.register('total_amount_yuan')} />{form.formState.errors.total_amount_yuan && <p className="text-sm text-destructive">{form.formState.errors.total_amount_yuan.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="edit-contract-status">合同状态</Label><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm md:h-9" id="edit-contract-status" {...form.register('status')}>{contractStatusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="edit-contract-signed-at">签署日期</Label><Input id="edit-contract-signed-at" type="date" {...form.register('signed_at')} /></div><div className="space-y-1.5"><Label htmlFor="edit-contract-start-date">生效开始日</Label><Input id="edit-contract-start-date" type="date" {...form.register('effective_start_date')} /></div></div>
          <div className="space-y-1.5"><Label htmlFor="edit-contract-end-date">生效结束日</Label><Input id="edit-contract-end-date" type="date" {...form.register('effective_end_date')} />{form.formState.errors.effective_end_date && <p className="text-sm text-destructive">{form.formState.errors.effective_end_date.message}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="edit-contract-payment-due-at">回款截止日</Label><Input id="edit-contract-payment-due-at" type="date" {...form.register('payment_due_at')} /><p className="text-xs text-muted-foreground">用于逾期应收提醒，留空表示暂不计入逾期统计。</p>{form.formState.errors.payment_due_at && <p className="text-sm text-destructive">{form.formState.errors.payment_due_at.message}</p>}</div>
        </div>
      </form>
      <DialogFooter className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4">
        <Button disabled={updateContract.isPending} onClick={closeDialog} type="button" variant="outline">取消</Button>
        <Button disabled={updateContract.isPending || !contract} onClick={form.handleSubmit(submit)} type="button">{updateContract.isPending ? '正在保存' : '保存变更'}</Button>
      </DialogFooter>
    </>
  )

  return <Dialog onOpenChange={onOpenChange} open={open}><DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-y-auto p-0 sm:max-w-[600px]">{content}</DialogContent></Dialog>
}
