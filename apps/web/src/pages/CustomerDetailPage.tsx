// apps/web/src/pages/CustomerDetailPage.tsx
import { differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { CalendarCheck, ChevronLeft, CircleAlert, CircleCheck, Clock3, MapPin, Paperclip, Pencil, Phone, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
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
import { activityTypeLabels, dealStageLabels, getCustomerStatusLabel } from '@/lib/presentation'
import { toast } from 'sonner'

interface PresignResponse {
  uploadUrl: string
  objectKey: string
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
      await queryClient.invalidateQueries({ queryKey: customerDetailQueryKey(id ?? '') })
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
        body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream' }),
      })
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })

      if (!response.ok) throw new Error('附件上传失败')
      setUploadMessage(`已上传：${objectKey}`)
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : '附件上传失败')
    } finally {
      setIsUploading(false)
    }
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
    <section>
      <Link className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground" to="/customers">
        <ChevronLeft aria-hidden="true" className="size-4" />
        返回客户池
      </Link>

      <header className="mt-5 flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{customer.name}</h1>
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">{getCustomerStatusLabel(customer.status)}</span>
          </div>
          <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:gap-5">
            <span className="flex items-center gap-2"><Phone aria-hidden="true" className="size-4" />{customer.contactPhone ?? '未填写电话'}</span>
            <span className="flex items-center gap-2"><MapPin aria-hidden="true" className="size-4" />{customer.address ?? '未填写地址'}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button onClick={() => setEditCustomerOpen(true)} type="button" variant="outline"><Pencil aria-hidden="true" />编辑客户</Button>
          <Button disabled={!data?.deals.length} onClick={() => setVisitDialogOpen(true)}><CalendarCheck aria-hidden="true" />添加跟进记录</Button>
          <Button disabled={isUploading} onClick={() => fileInputRef.current?.click()} variant="outline">
            <Upload aria-hidden="true" />{isUploading ? '正在上传' : '上传附件'}
          </Button>
          <Button disabled={deleteCustomer.isPending} onClick={confirmDeleteCustomer} type="button" variant="outline"><Trash2 aria-hidden="true" />作废客户</Button>
          <input className="sr-only" onChange={uploadAttachment} ref={fileInputRef} type="file" />
        </div>
      </header>

      {uploadMessage && <p className="mt-3 text-sm text-muted-foreground">{uploadMessage}</p>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="gap-0 rounded-lg py-0 shadow-none">
          <CardHeader className="border-b border-border px-5 py-4"><CardTitle>跟进记录</CardTitle></CardHeader>
          <CardContent className="p-5">
            <ol className="relative space-y-6 border-l border-border pl-5">
              {data?.activities.map((activity) => (
                <li className="relative" key={activity.id}>
                  <span className="absolute -left-[25px] top-1 size-2.5 rounded-full border-2 border-background bg-primary" />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium">{activityTypeLabels[activity.type]}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{dealStageLabels[activity.dealStage]}</span>
                    <time className="text-xs text-muted-foreground">{format(new Date(activity.createdAt), 'yyyy-MM-dd HH:mm')}</time>
                  </div>
                  {activity.notes && <p className="mt-1 text-sm leading-6 text-muted-foreground">{activity.notes}</p>}
                  {activity.checkInAddress && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin aria-hidden="true" className="size-3" />{activity.checkInAddress}</p>}
                </li>
              ))}
              {data?.activities.length === 0 && <li className="text-sm text-muted-foreground">暂无跟进记录</li>}
            </ol>
          </CardContent>
        </Card>

        <Card className="h-fit gap-0 rounded-lg py-0 shadow-none">
          <CardHeader className="border-b border-border px-5 py-4"><CardTitle>客户信息</CardTitle></CardHeader>
          <CardContent className="space-y-4 p-5 text-sm">
            <div><p className="text-muted-foreground">归属销售</p><p className="mt-1 font-medium">{customer.ownerId}</p></div>
            <div><p className="text-muted-foreground">创建时间</p><p className="mt-1 font-medium">{format(new Date(customer.createdAt), 'yyyy-MM-dd')}</p></div>
            <div><p className="text-muted-foreground">附件</p><p className="mt-1 flex items-center gap-1 font-medium"><Paperclip aria-hidden="true" className="size-4" />通过上传按钮添加</p></div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 gap-0 rounded-lg py-0 shadow-none">
        <CardHeader className="border-b border-border px-5 py-4"><CardTitle>已购 SaaS 服务</CardTitle></CardHeader>
        <CardContent className="grid gap-4 p-5 md:grid-cols-2">
          {data?.deals.filter((deal) => deal.stage === 'Won').map((deal) => {
            const serviceStatus = getServiceStatus(deal.expireDate)
            const StatusIcon = serviceStatus.icon
            return (
              <article className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4" key={deal.id}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold">购买产品：{deal.productName}</p><p className="mt-1 text-sm text-muted-foreground">成交商机：{dealStageLabels[deal.stage]}</p></div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${serviceStatus.className}`}><StatusIcon aria-hidden="true" className="size-3.5" />{serviceStatus.label}</span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">服务期限</dt><dd className="mt-1 font-medium">{deal.startDate ? format(new Date(deal.startDate), 'yyyy-MM-dd') : '待完善'} 至 {deal.expireDate ? format(new Date(deal.expireDate), 'yyyy-MM-dd') : '待完善'}</dd></div>
                  <div><dt className="text-muted-foreground">成交金额</dt><dd className="mt-1 font-medium">{currency.format(deal.amount)}</dd></div>
                  <div><dt className="text-muted-foreground">实际利润</dt><dd className="mt-1 font-medium text-emerald-700">{currency.format((deal.netProfit ?? 0) / 100)}</dd></div>
                  <div><dt className="text-muted-foreground">续费提醒</dt><dd className="mt-1 font-medium">提前 {deal.renewalReminderDays} 天</dd></div>
                </dl>
              </article>
            )
          })}
          {data?.deals.filter((deal) => deal.stage === 'Won').length === 0 && <p className="text-sm text-muted-foreground">该客户暂无已购 SaaS 服务。</p>}
        </CardContent>
      </Card>

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
