// apps/web/src/components/activities/CreateActivitySheet.tsx
import { MapPin, Paperclip, Send } from 'lucide-react'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useAMapLocation } from '@/hooks/useAMapLocation'
import { apiFetch } from '@/lib/api'
import { activityTypeLabels, dealStageLabels } from '@/lib/presentation'
import type { Deal } from '@/hooks/useDeals'

type ActivityType = 'Call' | 'Meeting' | 'Email'

interface CreatedActivityResponse { activity: { id: string } }
interface PresignResponse { uploadUrl: string; objectKey: string }

interface CreateActivitySheetProps {
  customerId: string
  deals: Array<Pick<Deal, 'id' | 'stage' | 'productName'>>
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => Promise<void>
}

export function CreateActivitySheet({ customerId, deals, open, onOpenChange, onCreated }: CreateActivitySheetProps) {
  const [notes, setNotes] = useState('')
  const [type, setType] = useState<ActivityType>('Meeting')
  const [dealId, setDealId] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [location, setLocation] = useState<{ lng: number; lat: number; address: string } | null>(null)
  const { getLocation, isLoading: isLocating, isConfigLoading, isConfigured, error: locationError } = useAMapLocation()

  async function attachFile(file: File, activityId: string) {
    const contentType = file.type || 'application/octet-stream'
    const { uploadUrl, objectKey } = await apiFetch<PresignResponse>('/api/storage/presign/document', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType, customer_id: customerId, activity_id: activityId }),
    })
    const uploadResponse = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })
    if (!uploadResponse.ok) throw new Error('附件上传失败')
    await apiFetch('/api/storage/attachments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, activity_id: activityId, file_key: objectKey, file_name: file.name, content_type: contentType }),
    })
  }

  const createActivity = useMutation({
    mutationFn: async () => {
      const response = await apiFetch<CreatedActivityResponse>('/api/activities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, deal_id: dealId || undefined, type, notes: notes.trim(), check_in_lng: location?.lng ?? null, check_in_lat: location?.lat ?? null, check_in_address: location?.address ?? null }),
      })
      if (attachment) await attachFile(attachment, response.activity.id)
    },
    onSuccess: async () => {
      await onCreated()
      setNotes(''); setType('Meeting'); setDealId(''); setAttachment(null); setLocation(null)
      onOpenChange(false)
      toast.success('完整跟进记录已保存')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '跟进记录保存失败'),
  })

  async function locate() {
    try { const result = await getLocation(); setLocation({ lng: result.lng, lat: result.lat, address: result.formattedAddress }) } catch { /* Hook exposes the error. */ }
  }

  return <Sheet onOpenChange={onOpenChange} open={open}>
    <SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-lg">
      <SheetHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5"><SheetTitle>完整跟进记录</SheetTitle><SheetDescription>记录沟通详情、定位打卡并可将附件关联到本次跟进。</SheetDescription></SheetHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
        <div className="space-y-2"><Label htmlFor="activity-notes"><span className="text-rose-500">*</span> 详细沟通内容</Label><Textarea autoFocus id="activity-notes" onChange={(event) => setNotes(event.target.value)} placeholder="请记录沟通结论、客户需求与下一步计划" value={notes} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>跟进方式</Label><Select onValueChange={(value) => setType(value as ActivityType)} value={type}><SelectTrigger><SelectValue placeholder="选择跟进方式" /></SelectTrigger><SelectContent>{Object.entries(activityTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>关联商机</Label><Select onValueChange={(value) => setDealId(value === 'none' ? '' : value)} value={dealId}><SelectTrigger><SelectValue placeholder="客户级跟进（可选）" /></SelectTrigger><SelectContent><SelectItem value="none">不关联商机</SelectItem>{deals.map((deal) => <SelectItem key={deal.id} value={deal.id}>{dealStageLabels[deal.stage]} · {deal.productName}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm font-semibold">高德地图定位打卡</p><p className="mt-1 break-words text-xs text-muted-foreground">{location?.address ?? locationError ?? '尚未获取定位'}</p></div><Button className="w-full sm:w-auto" disabled={isLocating || isConfigLoading || !isConfigured} onClick={locate} size="sm" type="button" variant="outline"><MapPin aria-hidden="true" />{isLocating ? '正在定位' : '获取位置'}</Button></div>{!isConfigured && !isConfigLoading && <p className="text-xs text-destructive">系统未配置地图密钥，请联系管理员。</p>}</div>
        <div className="space-y-2"><Label htmlFor="activity-attachment">附件</Label><Input accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.txt" id="activity-attachment" onChange={(event) => setAttachment(event.target.files?.[0] ?? null)} type="file" />{attachment && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Paperclip aria-hidden="true" className="size-3" />{attachment.name}</p>}</div>
      </div>
      <SheetFooter className="border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4"><Button onClick={() => onOpenChange(false)} type="button" variant="outline">取消</Button><Button disabled={!notes.trim() || !type || createActivity.isPending} onClick={() => createActivity.mutate()} type="button"><Send aria-hidden="true" />{createActivity.isPending ? '正在保存' : '保存跟进记录'}</Button></SheetFooter>
    </SheetContent>
  </Sheet>
}
