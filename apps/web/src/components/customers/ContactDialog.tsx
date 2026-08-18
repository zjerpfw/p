import { AtSign, BadgeCheck, MessageCircleMore, Phone, Plus, Save, UserRound } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { customerDetailQueryKey, type Contact } from '@/hooks/useCustomerDetail'
import { apiFetch } from '@/lib/api'

const contactFormSchema = z.object({
  name: z.string().trim().min(1, '请填写联系人姓名').max(100, '联系人姓名不能超过 100 个字符'),
  position: z.string().trim().max(100, '职位不能超过 100 个字符'),
  phone: z.string().trim().max(30, '手机号不能超过 30 个字符'),
  email: z.string().trim().max(254, '邮箱不能超过 254 个字符').refine((value) => value.length === 0 || z.string().email().safeParse(value).success, '邮箱格式无效'),
  wechat: z.string().trim().max(100, '企业微信或微信号不能超过 100 个字符'),
  is_primary: z.boolean(),
  notes: z.string().trim().max(2_000, '备注不能超过 2000 个字符'),
})

type ContactFormValues = z.infer<typeof contactFormSchema>

const defaultValues: ContactFormValues = {
  name: '',
  position: '',
  phone: '',
  email: '',
  wechat: '',
  is_primary: false,
  notes: '',
}

interface ContactDialogProps {
  contact: Contact | null
  customerId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ContactDialog({ contact, customerId, open, onOpenChange }: ContactDialogProps) {
  const queryClient = useQueryClient()
  const form = useForm<ContactFormValues>({ resolver: zodResolver(contactFormSchema), defaultValues })
  const isEditing = Boolean(contact)

  useEffect(() => {
    form.reset(contact ? {
      name: contact.name,
      position: contact.position ?? '',
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      wechat: contact.wechat ?? '',
      is_primary: contact.isPrimary,
      notes: contact.notes ?? '',
    } : defaultValues)
  }, [contact, form, open])

  const saveContact = useMutation({
    mutationFn: (values: ContactFormValues) => apiFetch(
      isEditing ? `/api/customers/${customerId}/contacts/${contact!.id}` : `/api/customers/${customerId}/contacts`,
      {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      },
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(customerId) })
      toast.success(isEditing ? '联系人已更新' : '联系人已添加')
      onOpenChange(false)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '联系人保存失败'),
  })

  return <Dialog onOpenChange={onOpenChange} open={open}>
    <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
      <DialogHeader className="border-b border-border px-5 py-5">
        <DialogTitle>{isEditing ? '编辑联系人' : '添加联系人'}</DialogTitle>
        <DialogDescription>维护客户关键联系人与沟通方式。</DialogDescription>
      </DialogHeader>
      <form className="min-h-0 flex-1 overflow-y-auto p-5" onSubmit={form.handleSubmit((values) => saveContact.mutate(values))}>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="contact-name"><span className="text-rose-500">*</span> 姓名</Label><div className="relative"><UserRound aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" id="contact-name" {...form.register('name')} placeholder="联系人姓名" /></div>{form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}</div>
          <div className="space-y-2"><Label htmlFor="contact-position">职位</Label><Input id="contact-position" {...form.register('position')} placeholder="如：采购负责人、技术负责人" /></div>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="contact-phone">手机号</Label><div className="relative"><Phone aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" id="contact-phone" inputMode="tel" {...form.register('phone')} placeholder="联系电话" /></div></div><div className="space-y-2"><Label htmlFor="contact-wechat">企业微信/微信</Label><div className="relative"><MessageCircleMore aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" id="contact-wechat" {...form.register('wechat')} placeholder="账号或微信号" /></div></div></div>
          <div className="space-y-2"><Label htmlFor="contact-email">邮箱</Label><div className="relative"><AtSign aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input className="pl-9" id="contact-email" inputMode="email" {...form.register('email')} placeholder="name@example.com" /></div>{form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}</div>
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-3 text-sm"><input className="size-4 accent-primary" type="checkbox" {...form.register('is_primary')} /><span className="flex items-center gap-2 font-medium"><BadgeCheck aria-hidden="true" className="size-4 text-emerald-600" />设为主要联系人</span></label>
          <div className="space-y-2"><Label htmlFor="contact-notes">备注</Label><Textarea id="contact-notes" {...form.register('notes')} placeholder="例如决策偏好、负责范围、沟通注意事项" /></div>
        </div>
      </form>
      <DialogFooter className="shrink-0 border-t border-border bg-background px-5 py-4"><Button onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={saveContact.isPending} onClick={form.handleSubmit((values) => saveContact.mutate(values))} type="button">{isEditing ? <Save aria-hidden="true" /> : <Plus aria-hidden="true" />}{saveContact.isPending ? '正在保存' : isEditing ? '保存修改' : '添加联系人'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
