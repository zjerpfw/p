// apps/web/src/components/customers/CustomerImportSheet.tsx
import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { apiFetch } from '@/lib/api'

interface CustomerImportSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CustomerImportResult {
  created: number
  skipped: number
  errors: Array<{ row: number; reason: string }>
}

function downloadTemplate() {
  const content = '\uFEFF客户名称,联系电话,当前状态,省份,城市,公司地址\n示例客户,13800138000,Following,河南省,焦作市,解放区示例路 100 号\n'
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = '客户导入模板.csv'
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function CustomerImportSheet({ open, onOpenChange }: CustomerImportSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<CustomerImportResult | null>(null)
  const importCustomers = useMutation({
    mutationFn: (selectedFile: File) => {
      const formData = new FormData()
      formData.set('file', selectedFile)
      return apiFetch<CustomerImportResult>('/api/customers/import/csv', { method: 'POST', body: formData })
    },
    onSuccess: async (importResult) => {
      setResult(importResult)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success(`已导入 ${importResult.created} 位客户`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : '客户导入失败'),
  })

  function close() {
    setFile(null)
    setResult(null)
    onOpenChange(false)
  }

  return <Sheet onOpenChange={(nextOpen) => nextOpen || close()} open={open}>
    <SheetContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
      <SheetHeader className="border-b border-slate-200 px-6 py-5">
        <SheetTitle>批量导入客户</SheetTitle>
        <SheetDescription>上传 CSV 后，客户将自动归属到当前登录人员；可填写省份和城市用于成交客户拜访规划。</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5">
          <input accept=".csv,text/csv" className="sr-only" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null) }} ref={inputRef} type="file" />
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{file?.name ?? '尚未选择 CSV 文件'}</p><p className="mt-1 text-xs text-muted-foreground">最多 200 行，文件不超过 512 KiB。</p></div><Button onClick={() => inputRef.current?.click()} type="button" variant="outline"><Upload aria-hidden="true" />选择文件</Button></div>
        </div>
        <Button className="w-full justify-start" onClick={downloadTemplate} type="button" variant="ghost"><Download aria-hidden="true" />下载 CSV 模板</Button>
        {result && <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm"><div className="grid grid-cols-3 gap-3 text-center"><div><p className="text-lg font-semibold text-emerald-700">{result.created}</p><p className="text-xs text-muted-foreground">已创建</p></div><div><p className="text-lg font-semibold text-amber-700">{result.skipped}</p><p className="text-xs text-muted-foreground">重复跳过</p></div><div><p className="text-lg font-semibold text-rose-700">{result.errors.length}</p><p className="text-xs text-muted-foreground">格式错误</p></div></div>{result.errors.length > 0 && <ul className="max-h-36 space-y-1 overflow-y-auto border-t border-slate-100 pt-3 text-xs text-rose-700">{result.errors.map((error) => <li key={`${error.row}-${error.reason}`}>第 {error.row} 行：{error.reason}</li>)}</ul>}</div>}
      </div>
      <SheetFooter className="border-t border-slate-200 bg-white px-6 py-4 sm:flex-row sm:justify-end">
        <Button onClick={close} type="button" variant="outline">{result ? '完成' : '取消'}</Button>
        {!result && <Button disabled={!file || importCustomers.isPending} onClick={() => file && importCustomers.mutate(file)} type="button">{importCustomers.isPending ? '正在导入' : '开始导入'}</Button>}
      </SheetFooter>
    </SheetContent>
  </Sheet>
}
