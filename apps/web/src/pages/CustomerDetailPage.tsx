// apps/web/src/pages/CustomerDetailPage.tsx
import { differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { CalendarCheck, ChevronLeft, CircleAlert, CircleCheck, Clock3, Eye, MapPin, Paperclip, Pencil, Phone, Send, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EditCustomerModal } from '@/components/customers/EditCustomerModal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { customerDetailQueryKey, useCustomerDetail } from '@/hooks/useCustomerDetail'
import { useAMapLocation } from '@/hooks/useAMapLocation'
import { apiFetch } from '@/lib/api'
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
  deal_id: string
  type: 'Call' | 'Meeting' | 'Email'
  notes: string
  check_in_lng: number | null
  check_in_lat: number | null
  check_in_address: string | null
}

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 0,
})

function getServiceStatus(expireDate: string | null) {
  if (!expireDate) return { label: '服务日期待完善', className: 'bg-muted text-muted-foreground', icon: Clock3 }

  const remainingDays = differenceInCalendarDays(new Date(expireDate), startOfDay(new Date()))
  if (remainingDays < 0) return { label: '已过期', className: 'bg-rose-100 text-rose-800', icon: CircleAlert }
  if (remainingDays < 30) return { label: '即将到期', className: 'bg-amber-100 text-amber-800', icon: CircleAlert }
  return { label: '服务中', className: 'bg-emerald-100 text-emerald-800', icon: CircleCheck }
}

export default function CustomerDetailPage() {
  const { id } = useParams()
  const { data, error, isLoading } = useCustomerDetail(id)
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [visitDialogOpen, setVisitDialogOpen] = useState(false)
  const [editCustomerOpen, setEditCustomerOpen] = useState(false)
  const [locationAddress, setLocationAddress] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [activityType, setActivityType] = useState<CreateActivityPayload['type']>('Meeting')
  const [selectedDealId, setSelectedDealId] = useState('')
  const [selectedAttachmentActivityId, setSelectedAttachmentActivityId] = useState('')
  const [coordinates, setCoordinates] = useState<{ lng: number; lat: number } | null>(null)
  const {
    getLocation,
    isLoading: isLocating,
    isConfigLoading: isMapConfigLoading,
    isConfigured: isMapConfigured,
    error: locationError,
  } = useAMapLocation()

  const customer = data?.customer

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
      ])
      setVisitDialogOpen(false)
      setNotes('')
      setCoordinates(null)
      setLocationAddress(null)
    },
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

  function confirmDeleteCustomer() {
    if (!customer || !window.confirm(`确认作废客户“${customer.name}”吗？此操作不会物理删除数据。`)) return
    deleteCustomer.mutate()
  }

  async function getCurrentLocation() {
    try {
      const location = await getLocation()
      setCoordinates({ lng: location.lng, lat: location.lat })
      setLocationAddress(location.formattedAddress)
    } catch {
      // The hook already exposes a user-facing error state.
    }
  }

  function submitVisitRecord() {
    const dealId = selectedDealId || data?.deals[0]?.id
    if (!dealId) return

    createActivity.mutate({
      deal_id: dealId,
      type: activityType,
      notes,
      check_in_lng: coordinates?.lng ?? null,
      check_in_lat: coordinates?.lat ?? null,
      check_in_address: locationAddress,
    })
  }

  function submitQuickNote() {
    if (!notes.trim()) return
    submitVisitRecord()
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

  return (
    <section className="space-y-6">
      <Link className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground" to="/customers">
        <ChevronLeft aria-hidden="true" className="size-4" />
        返回客户池
      </Link>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(250px,0.8fr)_minmax(420px,1.35fr)_minmax(280px,0.9fr)]">
        <aside className="space-y-4 xl:sticky xl:top-4">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border px-5 py-4"><div className="flex items-center justify-between gap-3"><div><CardTitle>{customer.name}</CardTitle><div className="mt-2"><Badge tone={getCustomerStatusTone(customer.status)}>{getCustomerStatusLabel(customer.status)}</Badge></div></div><Button aria-label="编辑客户" onClick={() => setEditCustomerOpen(true)} size="icon-sm" type="button" variant="ghost"><Pencil aria-hidden="true" /></Button></div></CardHeader>
            <CardContent className="space-y-5 p-5 text-sm"><div><p className="mb-1.5 text-xs font-semibold text-slate-400">联系方式</p><p className="flex items-center gap-2 font-medium text-slate-700"><Phone aria-hidden="true" className="size-4 text-indigo-500" />{customer.contactPhone ?? '未填写电话'}</p></div><div><p className="mb-1.5 text-xs font-semibold text-slate-400">公司地址</p><p className="flex items-start gap-2 leading-5 text-slate-700"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-indigo-500" />{customer.address ?? '未填写地址'}</p></div><div className="border-t border-slate-100 pt-4"><p className="text-xs text-muted-foreground">归属销售</p><p className="mt-1 font-semibold text-slate-800">{customer.ownerId}</p><p className="mt-4 text-xs text-muted-foreground">创建时间</p><p className="mt-1 font-medium text-slate-700">{format(new Date(customer.createdAt), 'yyyy-MM-dd')}</p></div></CardContent>
          </Card>
          <div className="grid gap-2"><Button disabled={!data?.deals.length} onClick={() => setVisitDialogOpen(true)} type="button"><CalendarCheck aria-hidden="true" />完整跟进记录</Button><Button disabled={deleteCustomer.isPending} onClick={confirmDeleteCustomer} type="button" variant="ghost"><Trash2 aria-hidden="true" />作废客户</Button></div>
        </aside>

        <main className="min-w-0 space-y-4">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border px-5 py-4"><CardTitle>快捷写跟进</CardTitle></CardHeader>
            <CardContent className="space-y-3 p-4"><textarea className="min-h-28 w-full resize-none rounded-md border border-slate-200 bg-slate-50 p-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" onChange={(event) => setNotes(event.target.value)} placeholder="记录本次沟通重点、客户需求和下一步计划..." value={notes} /><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><select aria-label="关联商机" className="h-9 max-w-44 rounded-md border border-input bg-background px-2 text-xs" onChange={(event) => setSelectedDealId(event.target.value)} value={selectedDealId}>{data?.deals.map((deal) => <option key={deal.id} value={deal.id}>{dealStageLabels[deal.stage]}</option>)}</select><select aria-label="拜访方式" className="h-9 rounded-md border border-input bg-background px-2 text-xs" onChange={(event) => setActivityType(event.target.value as CreateActivityPayload['type'])} value={activityType}>{Object.entries(activityTypeLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></div><Button disabled={createActivity.isPending || !notes.trim() || !data?.deals.length} onClick={submitQuickNote} size="sm" type="button"><Send aria-hidden="true" />{createActivity.isPending ? '正在保存' : '提交跟进'}</Button></div>{createActivity.error && <p className="text-sm text-destructive">{createActivity.error.message}</p>}</CardContent>
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
                    <Badge tone={getDealStageTone(activity.dealStage)}>{dealStageLabels[activity.dealStage]}</Badge>
                    <time className="text-xs text-muted-foreground">{format(new Date(activity.createdAt), 'yyyy-MM-dd HH:mm')}</time>
                  </div>
                  {activity.notes && <p className="mt-1 text-sm leading-6 text-muted-foreground">{activity.notes}</p>}
                  {activity.checkInAddress && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin aria-hidden="true" className="size-3" />{activity.checkInAddress}</p>}
                  {data?.attachments.filter((attachment) => attachment.activityId === activity.id).map((attachment) => <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs" key={attachment.id}><Paperclip aria-hidden="true" className="size-3.5 text-muted-foreground" /><span className="max-w-48 truncate font-medium">{attachment.fileName}</span><Button aria-label={`在线预览 ${attachment.fileName}`} onClick={() => previewAttachment(attachment.id)} size="xs" type="button" variant="ghost"><Eye aria-hidden="true" />预览</Button><Button aria-label={`删除 ${attachment.fileName}`} disabled={deleteAttachment.isPending} onClick={() => confirmDeleteAttachment(attachment.id)} size="icon-xs" type="button" variant="ghost"><Trash2 aria-hidden="true" /></Button></div>)}
                </li>
              ))}
              {data?.activities.length === 0 && <li className="text-sm text-muted-foreground">暂无跟进记录</li>}
            </ol>
          </CardContent>
          </Card>
        </main>

        <aside className="min-w-0 space-y-4">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border px-5 py-4"><CardTitle>商机与 SaaS 服务</CardTitle></CardHeader>
            <CardContent className="space-y-3 p-4">{data?.deals.map((deal) => { const serviceStatus = deal.stage === 'Won' ? getServiceStatus(deal.expireDate) : null; return <article className="rounded-md border border-slate-200 bg-slate-50 p-3" key={deal.id}><div className="flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-semibold text-slate-800">{deal.productName}</p><Badge tone={getDealStageTone(deal.stage)}>{dealStageLabels[deal.stage]}</Badge></div><p className="mt-2 text-sm font-bold text-indigo-700">{currency.format(deal.amount)}</p>{serviceStatus && <p className={`mt-2 text-xs font-medium ${serviceStatus.className}`}>{serviceStatus.label} · {deal.expireDate ? format(new Date(deal.expireDate), 'yyyy-MM-dd') : '待完善服务日期'}</p>}</article> })}{data?.deals.length === 0 && <p className="py-3 text-sm text-muted-foreground">暂无关联商机</p>}</CardContent>
          </Card>
          <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b border-border px-5 py-4"><CardTitle>附件</CardTitle></CardHeader>
            <CardContent className="divide-y divide-border p-0">{data?.attachments.filter((attachment) => !attachment.activityId).map((attachment) => <div className="flex items-center justify-between gap-2 px-4 py-3" key={attachment.id}><div className="min-w-0"><p className="truncate text-sm font-medium">{attachment.fileName}</p><p className="mt-1 text-xs text-muted-foreground">{format(new Date(attachment.createdAt), 'MM-dd HH:mm')}</p></div><div className="flex shrink-0"><Button aria-label={`在线预览 ${attachment.fileName}`} onClick={() => previewAttachment(attachment.id)} size="icon-xs" type="button" variant="ghost"><Eye aria-hidden="true" /></Button><Button aria-label={`删除 ${attachment.fileName}`} disabled={deleteAttachment.isPending} onClick={() => confirmDeleteAttachment(attachment.id)} size="icon-xs" type="button" variant="ghost"><Trash2 aria-hidden="true" /></Button></div></div>)}{data?.attachments.filter((attachment) => !attachment.activityId).length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">暂无附件</p>}</CardContent>
          </Card>
          <div className="space-y-2"><select aria-label="附件关联跟进记录" className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs" onChange={(event) => setSelectedAttachmentActivityId(event.target.value)} value={selectedAttachmentActivityId}><option value="">上传为客户级附件</option>{data?.activities.map((activity) => <option key={activity.id} value={activity.id}>{format(new Date(activity.createdAt), 'MM-dd')} · {activityTypeLabels[activity.type]}</option>)}</select><Button className="w-full" disabled={isUploading} onClick={() => fileInputRef.current?.click()} type="button" variant="outline"><Upload aria-hidden="true" />{isUploading ? '正在上传' : '上传附件'}</Button><input className="sr-only" onChange={uploadAttachment} ref={fileInputRef} type="file" />{uploadMessage && <p className="text-xs text-muted-foreground">{uploadMessage}</p>}</div>
        </aside>
      </div>

      <Dialog onOpenChange={setVisitDialogOpen} open={visitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加跟进记录</DialogTitle>
            <DialogDescription>提交后将保存本次沟通纪要和定位打卡信息。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="visit-notes">沟通纪要</Label>
            <Input id="visit-notes" onChange={(event) => setNotes(event.target.value)} placeholder="请输入本次沟通纪要" value={notes} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="visit-deal">关联商机</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" id="visit-deal" onChange={(event) => setSelectedDealId(event.target.value)} value={selectedDealId}>
                  {data?.deals.map((deal) => <option key={deal.id} value={deal.id}>{dealStageLabels[deal.stage]} · {deal.amount}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="activity-type">拜访方式</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" id="activity-type" onChange={(event) => setActivityType(event.target.value as CreateActivityPayload['type'])} value={activityType}>
                  {Object.entries(activityTypeLabels).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
                </select>
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/50 p-3 text-sm">
              <p className="font-medium">当前位置</p>
              {isMapConfigLoading ? (
                <p className="mt-1 text-muted-foreground">正在加载地图配置...</p>
              ) : isLocating ? (
                <p className="mt-1 text-muted-foreground">正在获取精准位置...</p>
              ) : !isMapConfigured ? (
                <p className="mt-1 text-destructive">系统未配置地图密钥，无法获取定位，请联系管理员在系统设置中配置。</p>
              ) : (
                <p className="mt-1 text-muted-foreground">{locationAddress ?? locationError ?? '尚未获取位置'}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button disabled={isLocating || isMapConfigLoading || !isMapConfigured} onClick={getCurrentLocation} type="button" variant="outline">
              <MapPin aria-hidden="true" />{isLocating ? '正在定位' : '定位打卡'}
            </Button>
            <Button disabled={createActivity.isPending || !data?.deals.length} onClick={submitVisitRecord} type="button">
              {createActivity.isPending ? '正在保存' : '保存记录'}
            </Button>
          </DialogFooter>
          {createActivity.error && <p className="text-sm text-destructive">{createActivity.error.message}</p>}
        </DialogContent>
      </Dialog>
      <EditCustomerModal customer={editCustomerOpen ? customer : null} onOpenChange={setEditCustomerOpen} />
    </section>
  )
}
