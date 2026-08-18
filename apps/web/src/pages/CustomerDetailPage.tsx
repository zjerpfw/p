// apps/web/src/pages/CustomerDetailPage.tsx
import { differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
import { AtSign, CalendarCheck, CalendarSync, Check, ChevronLeft, CircleAlert, CircleCheck, Clock3, Eye, MapPin, MessageCircleMore, Paperclip, Pencil, Phone, Plus, Send, Square, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CreateActivitySheet } from '@/components/activities/CreateActivitySheet'
import { EditActivitySheet } from '@/components/activities/EditActivitySheet'
import { CreateContractSheet } from '@/components/customers/CreateContractSheet'
import { CreateInvoiceSheet } from '@/components/customers/CreateInvoiceSheet'
import { CreatePaymentSheet } from '@/components/customers/CreatePaymentSheet'
import { CustomerFinancePanel } from '@/components/customers/CustomerFinancePanel'
import { ContactSheet } from '@/components/customers/ContactSheet'
import { CustomerTagManager } from '@/components/customers/CustomerTagManager'
import { TaskSheet } from '@/components/customers/TaskSheet'
import { EditTaskSheet, type EditableTask } from '@/components/customers/EditTaskSheet'
import { EditCustomerModal } from '@/components/customers/EditCustomerModal'
import { RenewCustomerSheet, type RenewCustomerTarget } from '@/components/customers/RenewCustomerSheet'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { customerDetailQueryKey, type Contact, useCustomerDetail } from '@/hooks/useCustomerDetail'
import { useContracts, useInvoices } from '@/hooks/useAssets'
import { apiFetch, getCurrentUserId, getCurrentUserRole } from '@/lib/api'
import type { Activity } from '@/hooks/useCustomerDetail'
import { formatCents } from '@/lib/money'
import { activityTypeLabels, dealStageLabels, getCustomerStatusLabel, getCustomerStatusTone, getDealStageTone } from '@/lib/presentation'
import { toast } from 'sonner'

interface PresignResponse {
  uploadUrl: string
  objectKey: string
}

interface PreviewResponse {
  viewUrl: string
}

interface CreateActivityPayload {
  customer_id: string
  deal_id?: string
  type: 'Call' | 'Meeting' | 'Email'
  notes: string
  check_in_lng: number | null
  check_in_lat: number | null
  check_in_address: string | null
}

function getServiceStatus(expireDate: string | null) {
  if (!expireDate) return { label: '服务日期待完善', detail: '尚未记录当前服务期限', className: 'bg-muted text-muted-foreground', icon: Clock3 }

  const remainingDays = differenceInCalendarDays(parseISO(expireDate), startOfDay(new Date()))
  if (remainingDays < 0) return { label: '服务已到期', detail: `已到期 ${Math.abs(remainingDays)} 天`, className: 'bg-rose-100 text-rose-800', icon: CircleAlert }
  if (remainingDays === 0) return { label: '今日到期', detail: '请尽快联系客户续费', className: 'bg-amber-100 text-amber-800', icon: CircleAlert }
  if (remainingDays < 30) return { label: '即将到期', detail: `剩余 ${remainingDays} 天`, className: 'bg-amber-100 text-amber-800', icon: CircleAlert }
  return { label: '服务中', detail: `剩余 ${remainingDays} 天`, className: 'bg-emerald-100 text-emerald-800', icon: CircleCheck }
}

export default function CustomerDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const { data, error, isLoading } = useCustomerDetail(id)
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activitySheetOpen, setActivitySheetOpen] = useState(false)
  const [editCustomerOpen, setEditCustomerOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [activityType, setActivityType] = useState<CreateActivityPayload['type']>('Meeting')
  const [selectedAttachmentActivityId, setSelectedAttachmentActivityId] = useState('')
  const [renewTarget, setRenewTarget] = useState<RenewCustomerTarget | null>(null)
  const [contractSheetOpen, setContractSheetOpen] = useState(false)
  const [invoiceSheetOpen, setInvoiceSheetOpen] = useState(false)
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false)
  const [contactSheetOpen, setContactSheetOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [taskSheetOpen, setTaskSheetOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<EditableTask | null>(null)
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)

  const customer = data?.customer
  const assetCustomerId = customer?.id ?? ''
  // Hooks must run in the same order during loading and loaded renders.
  const customerContracts = useContracts({ customer_id: assetCustomerId, limit: 100, enabled: Boolean(assetCustomerId) })
  const customerInvoices = useInvoices({ customer_id: assetCustomerId, limit: 100, enabled: Boolean(assetCustomerId) })
  useEffect(() => {
    const targetId = location.hash === '#finance' || location.hash === '#tasks' ? location.hash.slice(1) : null
    if (!targetId || !customer?.id) return
    const frame = window.requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    return () => window.cancelAnimationFrame(frame)
  }, [customer?.id, location.hash])

  const createActivity = useMutation({
    mutationFn: (payload: CreateActivityPayload) =>
      apiFetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(id ?? '') }),
        queryClient.invalidateQueries({ queryKey: ['activities'] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
      ])
      setNotes('')
      toast.success('跟进记录已保存')
    },
    onError: (activityError) => toast.error(activityError instanceof Error ? activityError.message : '跟进记录保存失败'),
  })

  const deleteCustomer = useMutation({
    mutationFn: () => apiFetch(`/api/customers/${customer?.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['customers'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] })])
      toast.success('客户已作废')
      window.location.assign('/customers')
    },
    onError: (deleteError) => toast.error(deleteError instanceof Error ? deleteError.message : '客户作废失败'),
  })

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => apiFetch(`/api/storage/attachments/${attachmentId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(id ?? '') })
      toast.success('附件已永久删除')
    },
    onError: (deleteError) => toast.error(deleteError instanceof Error ? deleteError.message : '附件删除失败'),
  })

  const deleteContact = useMutation({
    mutationFn: (contactId: string) => apiFetch(`/api/customers/${customer?.id}/contacts/${contactId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(id ?? '') })
      toast.success('联系人已删除')
    },
    onError: (contactError) => toast.error(contactError instanceof Error ? contactError.message : '联系人删除失败'),
  })

  const deleteActivity = useMutation({
    mutationFn: (activityId: string) => apiFetch(`/api/activities/${activityId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(id ?? '') }),
        queryClient.invalidateQueries({ queryKey: ['activities'] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
      ])
      toast.success('跟进记录已删除，关联附件已保留为客户附件')
    },
    onError: (activityError) => toast.error(activityError instanceof Error ? activityError.message : '跟进记录删除失败'),
  })

  const updateTask = useMutation({
    mutationFn: (taskId: string) => apiFetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Completed' }),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(id ?? '') }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success('任务已完成')
    },
    onError: (taskError) => toast.error(taskError instanceof Error ? taskError.message : '任务更新失败'),
  })

  function confirmDeleteCustomer() {
    if (!customer || !window.confirm(`确认作废客户“${customer.name}”吗？此操作不会物理删除数据。`)) return
    deleteCustomer.mutate()
  }

  function submitQuickNote() {
    if (!customer) return
    if (!notes.trim()) {
      toast.error('请先填写沟通纪要')
      return
    }
    createActivity.mutate({
      customer_id: customer.id,
      type: activityType,
      notes: notes.trim(),
      check_in_lng: null,
      check_in_lat: null,
      check_in_address: null,
    })
  }

  async function uploadAttachment(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    setIsUploading(true)
    setUploadMessage(null)

    try {
      const { uploadUrl, objectKey } = await apiFetch<PresignResponse>('/api/storage/presign/document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream', customer_id: customer?.id, activity_id: selectedAttachmentActivityId || undefined }),
      })
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })

      if (!response.ok) throw new Error('附件上传失败')
      await apiFetch('/api/storage/attachments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customer?.id,
          activity_id: selectedAttachmentActivityId || undefined,
          file_key: objectKey,
          file_name: file.name,
          content_type: file.type || 'application/octet-stream',
        }),
      })
      setUploadMessage(`已上传：${objectKey}`)
      setSelectedAttachmentActivityId('')
      await queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(id ?? '') })
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : '附件上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  async function previewAttachment(attachmentId: string) {
    try {
      const { viewUrl } = await apiFetch<PreviewResponse>(`/api/storage/presign/view?attachment_id=${encodeURIComponent(attachmentId)}`)
      window.open(viewUrl, '_blank', 'noopener,noreferrer')
    } catch (previewError) {
      toast.error(previewError instanceof Error ? previewError.message : '附件预览失败')
    }
  }

  function confirmDeleteAttachment(attachmentId: string) {
    if (!window.confirm('确定要永久删除该附件吗？此操作无法恢复。')) return
    deleteAttachment.mutate(attachmentId)
  }

  function openCreateContact() {
    setEditingContact(null)
    setContactSheetOpen(true)
  }

  function openEditContact(contact: Contact) {
    setEditingContact(contact)
    setContactSheetOpen(true)
  }

  function confirmDeleteContact(contact: Contact) {
    if (!window.confirm(`确定要删除联系人“${contact.name}”吗？`)) return
    deleteContact.mutate(contact.id)
  }

  function confirmDeleteActivity(activity: Activity) {
    if (!window.confirm('确定删除这条跟进记录吗？关联附件会保留为客户附件。')) return
    deleteActivity.mutate(activity.id)
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">正在加载客户信息...</p>

  if (error) return <p className="text-sm text-destructive">{error.message}</p>

  if (!customer) {
    return (
      <section>
        <Link className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground" to="/customers">
          <ChevronLeft aria-hidden="true" className="size-4" />
          返回客户池
        </Link>
        <h1 className="mt-6 text-xl font-semibold">未找到该客户</h1>
      </section>
    )
  }

  const currentServiceStatus = getServiceStatus(customer.saasExpireDate)
  const CurrentServiceIcon = currentServiceStatus.icon
  const latestWonDeal = data?.deals.find((deal) => deal.stage === 'Won')
  const canManageFinance = getCurrentUserRole() === 'admin' || getCurrentUserId() === customer.ownerId
  const currentUserId = getCurrentUserId()
  const isAdmin = getCurrentUserRole() === 'admin'

  return (
    <section className="space-y-6">
      <Link className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground" to="/customers">
        <ChevronLeft aria-hidden="true" className="size-4" />
        返回客户池
      </Link>

      <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-start md:gap-5">
        <aside className="order-1 min-w-0 space-y-4 md:sticky md:top-4 md:w-[28%] md:shrink-0">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border px-5 py-4"><div className="flex items-center justify-between gap-3"><div><CardTitle>{customer.name}</CardTitle><div className="mt-2"><Badge tone={getCustomerStatusTone(customer.status)}>{getCustomerStatusLabel(customer.status)}</Badge></div></div><Button aria-label="编辑客户" onClick={() => setEditCustomerOpen(true)} size="icon-sm" type="button" variant="ghost"><Pencil aria-hidden="true" /></Button></div></CardHeader>
            <CardContent className="space-y-5 p-5 text-sm"><div><p className="mb-1.5 text-xs font-semibold text-slate-400">联系方式</p><p className="flex items-center gap-2 font-medium text-slate-700"><Phone aria-hidden="true" className="size-4 text-indigo-500" />{customer.contactPhone ?? '未填写电话'}</p></div><div><p className="mb-1.5 text-xs font-semibold text-slate-400">公司地址</p><p className="flex items-start gap-2 leading-5 text-slate-700"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-indigo-500" />{customer.address ?? '未填写地址'}</p></div><div className="border-t border-slate-100 pt-4"><p className="text-xs text-muted-foreground">归属销售</p><p className="mt-1 font-semibold text-slate-800">{customer.ownerName ?? customer.ownerId}</p><p className="mt-4 text-xs text-muted-foreground">创建时间</p><p className="mt-1 font-medium text-slate-700">{format(new Date(customer.createdAt), 'yyyy-MM-dd')}</p></div><CustomerTagManager customerId={customer.id} tags={data?.tags ?? []} /></CardContent>
          </Card>
          <Card className="gap-0 overflow-hidden py-0">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border px-5 py-4"><CardTitle>联系人</CardTitle><Button aria-label="添加联系人" onClick={openCreateContact} size="icon-sm" type="button" variant="ghost"><Plus aria-hidden="true" /></Button></CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {data?.contacts.map((contact) => <article className="px-5 py-4" key={contact.id}>
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-800">{contact.name}</p>{contact.isPrimary && <Badge tone="success">主要联系人</Badge>}</div>{contact.position && <p className="mt-1 text-xs text-muted-foreground">{contact.position}</p>}</div><div className="flex shrink-0"><Button aria-label={`编辑联系人 ${contact.name}`} onClick={() => openEditContact(contact)} size="icon-xs" type="button" variant="ghost"><Pencil aria-hidden="true" /></Button><Button aria-label={`删除联系人 ${contact.name}`} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" disabled={deleteContact.isPending} onClick={() => confirmDeleteContact(contact)} size="icon-xs" type="button" variant="ghost"><Trash2 aria-hidden="true" /></Button></div></div>
                <div className="mt-3 space-y-1.5 text-xs text-slate-600">{contact.phone && <a className="flex items-center gap-2 hover:text-primary" href={`tel:${contact.phone}`}><Phone aria-hidden="true" className="size-3.5" />{contact.phone}</a>}{contact.email && <a className="flex items-center gap-2 hover:text-primary" href={`mailto:${contact.email}`}><AtSign aria-hidden="true" className="size-3.5" />{contact.email}</a>}{contact.wechat && <p className="flex items-center gap-2"><MessageCircleMore aria-hidden="true" className="size-3.5" />{contact.wechat}</p>}</div>{contact.notes && <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-muted-foreground">{contact.notes}</p>}
              </article>)}
              {data?.contacts.length === 0 && <div className="px-5 py-6 text-sm text-muted-foreground"><p>暂无联系人</p><Button className="mt-3" onClick={openCreateContact} size="sm" type="button" variant="outline"><Plus aria-hidden="true" />添加首位联系人</Button></div>}
            </CardContent>
          </Card>
          <Card className="gap-0 overflow-hidden py-0" id="tasks">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border px-5 py-4"><CardTitle>跟进任务</CardTitle><Button aria-label="新建跟进任务" onClick={() => setTaskSheetOpen(true)} size="icon-sm" type="button" variant="ghost"><Plus aria-hidden="true" /></Button></CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {data?.tasks.map((task) => <article className="flex items-start gap-3 px-5 py-4" key={task.id}><button aria-label={task.status === 'Completed' ? `任务 ${task.title} 已完成` : `完成任务 ${task.title}`} className="mt-0.5 shrink-0 text-muted-foreground hover:text-emerald-600" disabled={task.status === 'Completed' || updateTask.isPending} onClick={() => updateTask.mutate(task.id)} type="button">{task.status === 'Completed' ? <Check aria-hidden="true" className="size-4 text-emerald-600" /> : <Square aria-hidden="true" className="size-4" />}</button><div className="min-w-0 flex-1"><p className={`text-sm font-medium ${task.status === 'Completed' ? 'text-muted-foreground line-through' : 'text-slate-800'}`}>{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{task.status === 'Completed' ? '已完成' : `截止 ${format(new Date(task.dueAt), 'MM-dd HH:mm')}`}{task.priority === 'High' && task.status !== 'Completed' ? ' · 高优先级' : ''}</p>{task.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>}</div><Button aria-label={`编辑任务 ${task.title}`} onClick={() => setEditingTask(task)} size="icon-xs" type="button" variant="ghost"><Pencil aria-hidden="true" /></Button></article>)}
              {data?.tasks.length === 0 && <div className="px-5 py-6 text-sm text-muted-foreground"><p>暂无跟进任务</p><Button className="mt-3" onClick={() => setTaskSheetOpen(true)} size="sm" type="button" variant="outline"><Plus aria-hidden="true" />创建任务</Button></div>}
            </CardContent>
          </Card>
          <div className="grid gap-2"><Button onClick={() => setActivitySheetOpen(true)} type="button"><CalendarCheck aria-hidden="true" />完整跟进记录</Button><Button disabled={deleteCustomer.isPending} onClick={confirmDeleteCustomer} type="button" variant="ghost"><Trash2 aria-hidden="true" />作废客户</Button></div>
        </aside>

        <main className="order-2 min-w-0 space-y-4 md:flex-1">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border px-5 py-4"><CardTitle>快捷写跟进</CardTitle></CardHeader>
            <CardContent className="space-y-3 p-4"><Textarea onChange={(event) => setNotes(event.target.value)} placeholder="记录本次沟通重点、客户需求和下一步计划..." value={notes} /><div className="flex flex-wrap items-center justify-between gap-3"><div className="w-full sm:w-44"><Select onValueChange={(value) => setActivityType(value as CreateActivityPayload['type'])} value={activityType}><SelectTrigger aria-label="跟进方式"><SelectValue placeholder="选择跟进方式" /></SelectTrigger><SelectContent>{Object.entries(activityTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><Button disabled={createActivity.isPending || !notes.trim() || !activityType} onClick={submitQuickNote} size="sm" type="button"><Send aria-hidden="true" />{createActivity.isPending ? '正在保存' : '提交跟进'}</Button></div>{createActivity.error && <p className="text-sm text-destructive">{createActivity.error.message}</p>}</CardContent>
          </Card>
          <Card className="gap-0 py-0">
           <CardHeader className="border-b border-border px-5 py-4"><CardTitle>跟进记录</CardTitle></CardHeader>
          <CardContent className="p-5">
            <ol className="relative space-y-6 border-l border-border pl-5">
              {data?.activities.map((activity) => (
                <li className="relative" key={activity.id}>
                  <span className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-background bg-primary" />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium">{activityTypeLabels[activity.type]}</span>
                    {activity.dealStage && <Badge tone={getDealStageTone(activity.dealStage)}>{dealStageLabels[activity.dealStage]}</Badge>}
                    <time className="text-xs text-muted-foreground">{format(new Date(activity.createdAt), 'yyyy-MM-dd HH:mm')}</time>
                  </div>
                  {activity.notes && <p className="mt-1 text-sm leading-6 text-muted-foreground">{activity.notes}</p>}
                  {activity.checkInAddress && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin aria-hidden="true" className="size-3" />{activity.checkInAddress}</p>}
                  {(isAdmin || currentUserId === activity.createdBy) && <div className="mt-2 flex items-center gap-1"><Button aria-label="编辑跟进记录" onClick={() => setEditingActivity(activity)} size="icon-xs" type="button" variant="ghost"><Pencil aria-hidden="true" /></Button><Button aria-label="删除跟进记录" disabled={deleteActivity.isPending} onClick={() => confirmDeleteActivity(activity)} size="icon-xs" type="button" variant="ghost"><Trash2 aria-hidden="true" /></Button></div>}
                  {data?.attachments.filter((attachment) => attachment.activityId === activity.id).map((attachment) => <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs" key={attachment.id}><Paperclip aria-hidden="true" className="size-3.5 text-muted-foreground" /><span className="max-w-48 truncate font-medium">{attachment.fileName}</span><Button aria-label={`在线预览 ${attachment.fileName}`} onClick={() => previewAttachment(attachment.id)} size="xs" type="button" variant="ghost"><Eye aria-hidden="true" />预览</Button><Button aria-label={`删除 ${attachment.fileName}`} disabled={deleteAttachment.isPending} onClick={() => confirmDeleteAttachment(attachment.id)} size="icon-xs" type="button" variant="ghost"><Trash2 aria-hidden="true" /></Button></div>)}
                </li>
              ))}
              {data?.activities.length === 0 && <li className="text-sm text-muted-foreground">暂无跟进记录</li>}
            </ol>
          </CardContent>
          </Card>
        </main>

        <aside className="order-3 min-w-0 space-y-4 md:w-[30%] md:shrink-0">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border px-5 py-4"><CardTitle>当前 SaaS 服务</CardTitle></CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><CurrentServiceIcon aria-hidden="true" className="size-4" />当前 SaaS 到期日</p><Badge className={currentServiceStatus.className}>{currentServiceStatus.label}</Badge></div>
                <p className="mt-3 text-lg font-bold text-slate-900">{customer.saasExpireDate ? format(parseISO(customer.saasExpireDate), 'yyyy-MM-dd') : '尚未开通'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{currentServiceStatus.detail}</p>
                {customer.saasExpireDate && latestWonDeal && <Button className="mt-3 w-full text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800" onClick={() => setRenewTarget({ customerId: customer.id, customerName: customer.name, currentExpireDate: customer.saasExpireDate!, productName: latestWonDeal.productName, channel: latestWonDeal.channel })} size="sm" type="button" variant="outline"><CalendarSync aria-hidden="true" />续费</Button>}
              </div>
              <div><p className="mb-2 text-xs font-semibold text-slate-500">历史成交与商机记录</p><div className="space-y-3">{data?.deals.map((deal) => <article className="rounded-md border border-slate-200 bg-white p-3" key={deal.id}><div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-semibold text-slate-800">{deal.productName}</p><Badge tone={getDealStageTone(deal.stage)}>{dealStageLabels[deal.stage]}</Badge></div>{deal.channel && <Badge className="mt-2" tone="info">渠道：{deal.channel}</Badge>}<p className="mt-2 flex items-center gap-2 text-sm font-bold text-indigo-700">{deal.originalPriceCents && deal.originalPriceCents > deal.amountCents && <span className="text-xs font-normal text-slate-400 line-through">{formatCents(deal.originalPriceCents)}</span>}{formatCents(deal.amountCents)}</p><p className="mt-2 text-xs text-muted-foreground">{deal.dealType === 'Renewal' ? '续费成交' : '新购商机'} · {format(new Date(deal.createdAt), 'yyyy-MM-dd')}</p></article>)}{data?.deals.length === 0 && <p className="py-3 text-sm text-muted-foreground">暂无关联商机</p>}</div></div>
            </CardContent>
          </Card>
          <div id="finance">
            <CustomerFinancePanel
              canManage={canManageFinance}
              customerId={customer.id}
              onCreateContract={() => setContractSheetOpen(true)}
              onCreateInvoice={() => setInvoiceSheetOpen(true)}
              onCreatePayment={() => setPaymentSheetOpen(true)}
            />
          </div>
          <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b border-border px-5 py-4"><CardTitle>附件</CardTitle></CardHeader>
            <CardContent className="divide-y divide-border p-0">{data?.attachments.filter((attachment) => !attachment.activityId).map((attachment) => <div className="flex items-center justify-between gap-2 px-4 py-3" key={attachment.id}><div className="min-w-0"><p className="truncate text-sm font-medium">{attachment.fileName}</p><p className="mt-1 text-xs text-muted-foreground">{format(new Date(attachment.createdAt), 'MM-dd HH:mm')}</p></div><div className="flex shrink-0"><Button aria-label={`在线预览 ${attachment.fileName}`} onClick={() => previewAttachment(attachment.id)} size="icon-xs" type="button" variant="ghost"><Eye aria-hidden="true" /></Button><Button aria-label={`删除 ${attachment.fileName}`} disabled={deleteAttachment.isPending} onClick={() => confirmDeleteAttachment(attachment.id)} size="icon-xs" type="button" variant="ghost"><Trash2 aria-hidden="true" /></Button></div></div>)}{data?.attachments.filter((attachment) => !attachment.activityId).length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">暂无附件</p>}</CardContent>
          </Card>
          <div className="space-y-2"><select aria-label="附件关联跟进记录" className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs" onChange={(event) => setSelectedAttachmentActivityId(event.target.value)} value={selectedAttachmentActivityId}><option value="">上传为客户级附件</option>{data?.activities.map((activity) => <option key={activity.id} value={activity.id}>{format(new Date(activity.createdAt), 'MM-dd')} · {activityTypeLabels[activity.type]}</option>)}</select><Button className="w-full" disabled={isUploading} onClick={() => fileInputRef.current?.click()} type="button" variant="outline"><Upload aria-hidden="true" />{isUploading ? '正在上传' : '上传附件'}</Button><input className="sr-only" onChange={uploadAttachment} ref={fileInputRef} type="file" />{uploadMessage && <p className="text-xs text-muted-foreground">{uploadMessage}</p>}</div>
        </aside>
      </div>

      <CreateActivitySheet customerId={customer.id} deals={data?.deals ?? []} onCreated={() => Promise.all([queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(id ?? '') }), queryClient.invalidateQueries({ queryKey: ['activities'] }), queryClient.invalidateQueries({ queryKey: ['customers'] })]).then(() => undefined)} onOpenChange={setActivitySheetOpen} open={activitySheetOpen} />
      <EditActivitySheet activity={editingActivity} customerId={customer.id} deals={data?.deals ?? []} onOpenChange={(open) => !open && setEditingActivity(null)} open={Boolean(editingActivity)} />
      <EditCustomerModal customer={editCustomerOpen ? customer : null} onOpenChange={setEditCustomerOpen} />
      <ContactSheet contact={editingContact} customerId={customer.id} onOpenChange={(open) => { setContactSheetOpen(open); if (!open) setEditingContact(null) }} open={contactSheetOpen} />
      <TaskSheet customerId={customer.id} deals={data?.deals.map((deal) => ({ id: deal.id, productName: deal.productName, stage: deal.stage })) ?? []} onOpenChange={setTaskSheetOpen} open={taskSheetOpen} />
      <EditTaskSheet onOpenChange={(open) => { if (!open) setEditingTask(null) }} open={Boolean(editingTask)} task={editingTask} />
      <RenewCustomerSheet onOpenChange={(open) => !open && setRenewTarget(null)} target={renewTarget} />
      <CreateContractSheet
        customerId={customer.id}
        customerName={customer.name}
        deals={data?.deals.map((deal) => ({ id: deal.id, productName: deal.productName, amountCents: deal.amountCents })) ?? []}
        onOpenChange={setContractSheetOpen}
        open={contractSheetOpen}
      />
      <CreateInvoiceSheet
        contracts={customerContracts.data?.data ?? []}
        customerId={customer.id}
        customerName={customer.name}
        onOpenChange={setInvoiceSheetOpen}
        open={invoiceSheetOpen}
      />
      <CreatePaymentSheet
        contracts={customerContracts.data?.data ?? []}
        customerId={customer.id}
        customerName={customer.name}
        invoices={customerInvoices.data?.data ?? []}
        onOpenChange={setPaymentSheetOpen}
        open={paymentSheetOpen}
      />
    </section>
  )
}
