// apps/web/src/pages/CustomerDetailPage.tsx
import { format } from 'date-fns'
import { CalendarCheck, ChevronLeft, MapPin, Paperclip, Phone, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
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

const activityTypeLabels = { Call: '电话', Meeting: '会议', Email: '邮件' } as const

export default function CustomerDetailPage() {
  const { id } = useParams()
  const { data, error, isLoading } = useCustomerDetail(id)
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [visitDialogOpen, setVisitDialogOpen] = useState(false)
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
            <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">{customer.status}</span>
          </div>
          <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:gap-5">
            <span className="flex items-center gap-2"><Phone aria-hidden="true" className="size-4" />{customer.contactPhone ?? '未填写电话'}</span>
            <span className="flex items-center gap-2"><MapPin aria-hidden="true" className="size-4" />{customer.address ?? '未填写地址'}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button disabled={!data?.deals.length} onClick={() => setVisitDialogOpen(true)}><CalendarCheck aria-hidden="true" />添加拜访记录</Button>
          <Button disabled={isUploading} onClick={() => fileInputRef.current?.click()} variant="outline">
            <Upload aria-hidden="true" />{isUploading ? '正在上传' : '上传附件'}
          </Button>
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
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{activity.dealStage}</span>
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
            <div><p className="text-muted-foreground">负责人</p><p className="mt-1 font-medium">{customer.ownerId}</p></div>
            <div><p className="text-muted-foreground">创建时间</p><p className="mt-1 font-medium">{format(new Date(customer.createdAt), 'yyyy-MM-dd')}</p></div>
            <div><p className="text-muted-foreground">附件</p><p className="mt-1 flex items-center gap-1 font-medium"><Paperclip aria-hidden="true" className="size-4" />通过上传按钮添加</p></div>
          </CardContent>
        </Card>
      </div>

      <Dialog onOpenChange={setVisitDialogOpen} open={visitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加拜访记录</DialogTitle>
            <DialogDescription>提交后将保存本次拜访的记录和打卡位置。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="visit-notes">拜访摘要</Label>
            <Input id="visit-notes" onChange={(event) => setNotes(event.target.value)} placeholder="记录本次沟通内容" value={notes} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="visit-deal">关联商机</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" id="visit-deal" onChange={(event) => setSelectedDealId(event.target.value)} value={selectedDealId}>
                  {data?.deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.stage} · {deal.amount}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="activity-type">记录类型</Label>
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
              <MapPin aria-hidden="true" />{isLocating ? '正在定位' : '获取当前位置'}
            </Button>
            <Button disabled={createActivity.isPending || !data?.deals.length} onClick={submitVisitRecord} type="button">
              {createActivity.isPending ? '正在保存' : '保存记录'}
            </Button>
          </DialogFooter>
          {createActivity.error && <p className="text-sm text-destructive">{createActivity.error.message}</p>}
        </DialogContent>
      </Dialog>
    </section>
  )
}
