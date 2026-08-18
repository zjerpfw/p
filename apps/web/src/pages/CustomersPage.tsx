// apps/web/src/pages/CustomersPage.tsx
import { useEffect, useState } from 'react'
import { ChevronRight, Download, MapPin, Phone, Plus, Search, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PaginationControls } from '@/components/PaginationControls'
import { CreateCustomerModal } from '@/components/customers/CreateCustomerModal'
import { DirectWonCustomerModal } from '@/components/customers/DirectWonCustomerModal'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useCustomers } from '@/hooks/useCustomers'
import { useCustomerTags } from '@/hooks/useCustomerTags'
import { useIsMobile } from '@/hooks/useIsMobile'
import { getCustomerStatusLabel, getCustomerStatusTone } from '@/lib/presentation'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Link, useSearchParams } from 'react-router-dom'
import { downloadApiFile } from '@/lib/api'

export default function CustomersPage() {
  const isMobile = useIsMobile()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [tagId, setTagId] = useState('')
  const [page, setPage] = useState(1)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [directWonDialogOpen, setDirectWonDialogOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const debouncedSearch = useDebouncedValue(search.trim())
  const { data, error, isLoading } = useCustomers({ search: debouncedSearch, status, tagId, page })
  const tagsQuery = useCustomerTags()
  const statuses = ['Active', 'Inactive']

  useEffect(() => {
    if (searchParams.get('create') !== '1') return
    setCreateDialogOpen(true)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('create')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  function updateSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  function updateStatus(value: string) {
    setStatus(value)
    setPage(1)
  }

  function updateTag(value: string) {
    setTagId(value)
    setPage(1)
  }

  async function exportCustomers() {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (status) params.set('status', status)
    if (tagId) params.set('tag_id', tagId)
    try {
      await downloadApiFile(`/api/customers/export/csv?${params.toString()}`, '客户清单.csv')
      toast.success('客户清单已开始下载')
    } catch (exportError) {
      toast.error(exportError instanceof Error ? exportError.message : '客户导出失败')
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-indigo-600">客户资产管理</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">客户池</h1>
          <p className="mt-1 text-sm text-muted-foreground">集中管理客户资料与跟进状态。</p>
        </div>
        <div className="flex flex-wrap gap-2"><Button onClick={() => void exportCustomers()} type="button" variant="outline"><Download aria-hidden="true" />导出客户</Button><Button className="bg-emerald-600 shadow-sm shadow-emerald-200 hover:bg-emerald-700" onClick={() => setDirectWonDialogOpen(true)} type="button"><Zap aria-hidden="true" />直接录入成交客户</Button><Button className="shadow-sm shadow-indigo-200" onClick={() => setCreateDialogOpen(true)} type="button"><Plus aria-hidden="true" />新建客户</Button></div>
      </div>
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-9 pr-9" onChange={(event) => updateSearch(event.target.value)} placeholder="搜索客户名称" value={search} />
          {search && <Button aria-label="清空客户搜索" className="absolute right-1 top-0.5" onClick={() => updateSearch('')} size="icon-sm" type="button" variant="ghost"><X aria-hidden="true" /></Button>}
        </div>
        <select aria-label="客户状态筛选" className="h-11 rounded-md border border-input bg-background px-3 text-sm md:h-9 md:w-36" onChange={(event) => updateStatus(event.target.value)} value={status}>
          <option value="">全部状态</option>
          {statuses.map((item) => <option key={item} value={item}>{getCustomerStatusLabel(item)}</option>)}
        </select>
        <select aria-label="客户标签筛选" className="h-11 rounded-md border border-input bg-background px-3 text-sm md:h-9 md:w-40" disabled={tagsQuery.isLoading} onChange={(event) => updateTag(event.target.value)} value={tagId}>
          <option value="">全部标签</option>
          {tagsQuery.data?.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select>
        </CardContent>
      </Card>
      {isLoading && <p className="mt-8 text-sm text-muted-foreground">正在加载客户数据...</p>}
      {error && <p className="mt-8 text-sm text-destructive">{error.message}</p>}
      {data && !isMobile && (
        <Card className="gap-0 overflow-hidden py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead className="w-10"><input aria-label="选择全部客户" className="size-4 rounded border-slate-300" type="checkbox" /></TableHead><TableHead>客户名称</TableHead><TableHead>联系电话</TableHead><TableHead>详细地址</TableHead><TableHead>当前状态</TableHead><TableHead>归属销售</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.data.map((customer) => <TableRow key={customer.id}>
                  <TableCell><input aria-label={`选择客户 ${customer.name}`} className="size-4 rounded border-slate-300" type="checkbox" /></TableCell>
                  <TableCell className="font-semibold text-slate-800">{customer.name}</TableCell>
                  <TableCell><span className="inline-flex items-center gap-1.5 text-slate-600"><Phone aria-hidden="true" className="size-3.5 text-slate-400" />{customer.contactPhone ?? '未填写'}</span></TableCell>
                  <TableCell className="max-w-64 truncate text-slate-600"><span className="inline-flex min-w-0 items-center gap-1.5"><MapPin aria-hidden="true" className="size-3.5 shrink-0 text-slate-400" />{customer.address ?? '未填写'}</span></TableCell>
                  <TableCell><Badge tone={getCustomerStatusTone(customer.status)}>{getCustomerStatusLabel(customer.status)}</Badge></TableCell>
                  <TableCell className="text-slate-600">{customer.ownerName ?? customer.ownerId}</TableCell>
                  <TableCell className="text-right"><Button asChild aria-label={`查看${customer.name}详情`} size="sm" type="button" variant="ghost"><Link to={`/customers/${customer.id}`}>详情<ChevronRight aria-hidden="true" /></Link></Button></TableCell>
                </TableRow>)}
                {data.data.length === 0 && <TableRow><TableCell className="py-12 text-center text-muted-foreground" colSpan={7}>未找到匹配的客户</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
          <PaginationControls onPageChange={setPage} page={data.page} total={data.total} totalPages={data.totalPages} />
        </Card>
      )}
      {data && isMobile && <div className="space-y-3">
        <ul className="space-y-3">
          {data.data.map((customer) => <li key={customer.id}><Link className="block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors active:bg-slate-50" to={`/customers/${customer.id}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-semibold text-slate-900">{customer.name}</h2><p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600"><Phone aria-hidden="true" className="size-4 shrink-0 text-slate-400" />{customer.contactPhone ?? '未填写电话'}</p></div><Badge tone={getCustomerStatusTone(customer.status)}>{getCustomerStatusLabel(customer.status)}</Badge></div><p className="mt-3 flex items-start gap-1.5 text-sm leading-5 text-slate-500"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400" /><span className="line-clamp-2">{customer.address ?? '未填写地址'}</span></p><div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400"><span>归属：{customer.ownerName ?? customer.ownerId}</span><span className="inline-flex items-center font-medium text-indigo-600">查看详情<ChevronRight aria-hidden="true" className="size-4" /></span></div></Link></li>)}
          {data.data.length === 0 && <li className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-muted-foreground">未找到匹配的客户</li>}
        </ul>
        <div className="rounded-lg border border-slate-200 bg-white"><PaginationControls onPageChange={setPage} page={data.page} total={data.total} totalPages={data.totalPages} /></div>
      </div>}
      <CreateCustomerModal onOpenChange={setCreateDialogOpen} open={createDialogOpen} />
      <DirectWonCustomerModal onOpenChange={setDirectWonDialogOpen} open={directWonDialogOpen} />
    </section>
  )
}
