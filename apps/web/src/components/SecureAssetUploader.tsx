// apps/web/src/components/SecureAssetUploader.tsx
import { useRef, useState } from 'react'
import { FileUp, LoaderCircle, RotateCcw, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  confirmAssetUpload,
  requestAssetPresignedUpload,
  type AttachmentAssetType,
  type ConfirmUploadResponse,
} from '@/lib/assets'
import { cn } from '@/lib/utils'

type UploadStatus = 'idle' | 'presigning' | 'uploading' | 'confirming' | 'success' | 'error'

interface SecureAssetUploaderProps {
  customerId: string
  dealId: string
  contractId?: string | null
  invoiceId?: string | null
  paymentId?: string | null
  assetType: AttachmentAssetType
  onSuccess?: (result: ConfirmUploadResponse) => void
  disabled?: boolean
  className?: string
}

const MAX_ASSET_BYTES = 50 * 1024 * 1024
const ACCEPTED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
const ACCEPT_ATTRIBUTE = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp'

function getParentId({ assetType, contractId, invoiceId, paymentId }: Pick<SecureAssetUploaderProps, 'assetType' | 'contractId' | 'invoiceId' | 'paymentId'>) {
  if (assetType === 'Contract') return contractId ?? null
  if (assetType === 'Invoice') return invoiceId ?? null
  return paymentId ?? null
}

function putFileWithProgress(uploadUrl: string, file: File, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onerror = () => reject(new Error('文件直传网络错误'))
    xhr.onabort = () => reject(new Error('文件上传已取消'))
    xhr.ontimeout = () => reject(new Error('文件上传超时'))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve()
        return
      }
      reject(new Error(`文件直传失败（HTTP ${xhr.status || '未知'}）`))
    }
    xhr.send(file)
  })
}

export function SecureAssetUploader({
  customerId,
  dealId,
  contractId,
  invoiceId,
  paymentId,
  assetType,
  onSuccess,
  disabled = false,
  className,
}: SecureAssetUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null)

  const parentId = getParentId({ assetType, contractId, invoiceId, paymentId })
  const isBusy = status === 'presigning' || status === 'uploading' || status === 'confirming'

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || isBusy || disabled) return
    if (!customerId || !dealId || !parentId) {
      setStatus('error')
      toast.error('资产归属信息不完整，暂时无法上传')
      return
    }
    if (!file.type || !ACCEPTED_MIME_TYPES.has(file.type)) {
      setStatus('error')
      toast.error('仅支持 PDF、PNG、JPEG 或 WebP 文件')
      return
    }
    if (file.size <= 0 || file.size > MAX_ASSET_BYTES) {
      setStatus('error')
      toast.error('文件大小必须在 1 字节至 50 MiB 之间')
      return
    }

    setSelectedFilename(file.name)
    setProgress(0)

    try {
      setStatus('presigning')
      const presigned = await requestAssetPresignedUpload({
        asset_type: assetType,
        parent_id: parentId,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      })

      setStatus('uploading')
      await putFileWithProgress(presigned.upload_url, file, setProgress)

      setStatus('confirming')
      const confirmed = await confirmAssetUpload(presigned.asset_id)
      setStatus('success')
      toast.success('文件已安全上传并完成登记')
      onSuccess?.(confirmed)
    } catch (error) {
      setStatus('error')
      const message = error instanceof Error ? error.message : '文件上传失败，请稍后重试'
      toast.error(message)
    }
  }

  function openFileDialog() {
    if (!isBusy && !disabled) inputRef.current?.click()
  }

  function reset() {
    if (isBusy) return
    setStatus('idle')
    setProgress(0)
    setSelectedFilename(null)
  }

  const statusMessage = status === 'presigning'
    ? '正在获取安全上传授权...'
    : status === 'uploading'
      ? `正在直传文件 ${progress}%`
      : status === 'confirming'
        ? '正在核验文件并登记资产...'
        : status === 'success'
          ? '上传完成'
          : status === 'error'
            ? '上传失败，请重新选择文件'
            : '支持 PDF、PNG、JPEG、WebP，最大 50 MiB'

  return (
    <div className={cn('space-y-3', className)}>
      <input
        ref={inputRef}
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        disabled={disabled || isBusy}
        onChange={handleFileChange}
        type="file"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={disabled || isBusy || !parentId} onClick={openFileDialog} type="button" variant="outline">
          {isBusy ? <LoaderCircle className="animate-spin" /> : <Upload />}
          {isBusy ? '正在上传' : '选择文件上传'}
        </Button>
        {(status === 'success' || status === 'error') && (
          <Button onClick={reset} size="sm" type="button" variant="ghost">
            <RotateCcw />
            重新选择
          </Button>
        )}
      </div>

      <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2.5 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <FileUp className="size-4 text-muted-foreground" />
          <span className="min-w-0 truncate">{selectedFilename ?? statusMessage}</span>
        </div>
        {status === 'uploading' && (
          <div className="mt-2 space-y-1.5">
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">{progress}%</p>
          </div>
        )}
        {status !== 'uploading' && status !== 'idle' && (
          <p className={cn('mt-1 text-xs', status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
            {statusMessage}
          </p>
        )}
      </div>
    </div>
  )
}
